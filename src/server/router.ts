import { FastifyInstance } from 'fastify';
import db from '../db';
import { handleOpenAI } from '../adapters/openai';
import { handleAnthropic } from '../adapters/anthropic';
import { withToolInterceptor, PredefinedToolSchemas } from '../middleware/tools';
import { injectMemory, saveMemory } from '../middleware/memory';
import { generateCacheHash, getCachedResponse, setCachedResponse } from '../middleware/cache';

export default async function routerRoutes(fastify: FastifyInstance) {
  // Wildcard route to handle /v1/chat/completions, /v1/models, etc.
  fastify.all('/v1/*', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const unifiedKey = authHeader.split(' ')[1];

    const keyRecord = db.prepare('SELECT * FROM UnifiedKeys WHERE key = ?').get(unifiedKey) as any;
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid unified API key' });
    }

    // Pass through for non-POST requests (like GET /v1/models)
    if (request.method !== 'POST') {
       return reply.status(200).send({ data: [{ id: 'gpt-4o', object: 'model' }, { id: 'claude-3-opus', object: 'model' }] });
    }

    const body: any = request.body || {};
    const requestedModel = body.model || 'gpt-3.5-turbo';

    // Check if the requested model is actually a Combo
    const combo = db.prepare('SELECT * FROM Combos WHERE name = ?').get(requestedModel) as any;
    const actualModel = combo ? combo.primary_model : requestedModel;

    // Update the body model to the actual underlying model
    body.model = actualModel;

    const isChatEndpoint = request.url.includes('/chat/completions');

    // Memory only applies to chat endpoints
    const sessionId = request.headers['x-session-id'] as string | undefined;
    if (isChatEndpoint && body.messages) {
      body.messages = injectMemory(sessionId, body.messages);
    }

    // Check cache if requested (or globally enabled by default)
    const useCache = request.headers['x-use-cache'] === 'true'; // Caching must be strictly opt-in to avoid breaking dynamic tools and streaming behavior
    let requestHash = '';

    if (useCache && isChatEndpoint) {
      requestHash = generateCacheHash(body);
      const cached = getCachedResponse(requestHash);
      if (cached) {
        return reply.status(200).send(cached);
      }
    }

    let targetProvider = 'openai'; // acts as a catch-all for OpenAI-compatible APIs too (Groq, Perplexity, Together, Local)

    // Auto-detect provider based on model naming conventions
    if (actualModel.includes('claude') || actualModel.startsWith('anthropic:')) {
      targetProvider = 'anthropic';
    } else if (actualModel.startsWith('gemini') || actualModel.includes('google')) {
      targetProvider = 'google';
    } else if (actualModel.startsWith('sonar') || actualModel.includes('pplx')) {
      targetProvider = 'perplexity';
    } else if (actualModel.includes('mixtral') || actualModel.includes('gemma') || actualModel.includes('llama')) {
      // Common open source models often hosted on Groq or Together. Defaulting to groq for speed
      targetProvider = 'groq';
    } else if (actualModel.startsWith('grok') || actualModel.includes('xai')) {
      targetProvider = 'xai';
    }

    // Load Balancing: Get all active keys for the provider
    const getActiveKeys = (provider: string) => {
      let keys = db.prepare('SELECT * FROM ProviderKeys WHERE provider_name = ? AND is_active = 1').all(provider) as any[];
      if (!keys || keys.length === 0) {
        const fallbackConfig = db.prepare('SELECT * FROM ProviderConfigs WHERE provider_name = ?').get(provider);
        if (fallbackConfig) keys.push(fallbackConfig);
      }
      return keys;
    };

    const activeKeys = getActiveKeys(targetProvider);
    if (activeKeys.length === 0) {
      return reply.status(500).send({ error: `No configuration or active keys found for provider: ${targetProvider}` });
    }

    const selectedKeyConfig = activeKeys[Math.floor(Math.random() * activeKeys.length)];
    if (selectedKeyConfig.id && selectedKeyConfig.is_active !== undefined) {
      db.prepare('UPDATE ProviderKeys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(selectedKeyConfig.id);
    }

    const runRequest = async (provider: string, keyConfig: any, currentBody: any) => {
      const executeAI = async (b: any) => {
        if (provider === 'anthropic') {
          return await handleAnthropic(keyConfig, b);
        } else {
          // OpenAI, Groq, Perplexity, xAI, Local etc all use OpenAI's chat completions schema
          // We rely on the adapter to use the dynamic base_url configured for that provider
          return await handleOpenAI(keyConfig, b);
        }
      };

      if (isChatEndpoint) {
        const tools = db.prepare('SELECT * FROM ToolConfigs').all() as any[];
        if (tools.length > 0) {
          currentBody.tools = currentBody.tools || [];
          for (const tool of tools) {
            if (!currentBody.tools.find((t: any) => t.function?.name === tool.tool_name)) {
               // Use predefined schema if it exists, otherwise fall back to generic
               const toolSchema = PredefinedToolSchemas[tool.tool_name] || {
                 name: tool.tool_name,
                 description: `Executes the ${tool.tool_name} tool API.`,
                 parameters: { type: 'object', properties: {} }
               };

               currentBody.tools.push({
                 type: 'function',
                 function: toolSchema
               });
            }
          }
        }
        return await withToolInterceptor(executeAI, currentBody);
      } else {
        return await executeAI(currentBody);
      }
    };

    const trackCost = (provider: string, mdl: string, usage: any, keyId: number | undefined) => {
      if (!usage) return;
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;

      // Extremely basic mock cost calculation - in a real app, you'd pull this from a pricing table
      const mockCostUsd = (promptTokens * 0.00001) + (completionTokens * 0.00003);

      db.prepare(`
        INSERT INTO CostTracking (unified_key_id, provider, model, prompt_tokens, completion_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(keyId || null, provider, mdl, promptTokens, completionTokens, mockCostUsd);
    };

    try {
      let finalResult = await runRequest(targetProvider, selectedKeyConfig, body);

      if (finalResult && finalResult.choices && finalResult.choices[0] && isChatEndpoint) {
        saveMemory(sessionId, (request.body as any).messages || [], finalResult.choices[0].message);
      }

      if (finalResult && finalResult.usage) {
        trackCost(targetProvider, actualModel, finalResult.usage, keyRecord.id);
      }

      if (useCache && isChatEndpoint && finalResult) {
        setCachedResponse(requestHash, finalResult);
      }

      return finalResult;
    } catch (err: any) {
      fastify.log.error(`Primary request failed: ${err.message}`);

      // Fallback Logic
      if (combo && combo.fallback_model) {
        fastify.log.info(`Falling back to ${combo.fallback_model}`);
        body.model = combo.fallback_model;

        let fallbackProvider = 'openai';
        if (combo.fallback_model.includes('claude') || combo.fallback_model.startsWith('anthropic:')) {
          fallbackProvider = 'anthropic';
        } else if (combo.fallback_model.startsWith('gemini')) {
          fallbackProvider = 'google';
        } else if (combo.fallback_model.startsWith('sonar')) {
          fallbackProvider = 'perplexity';
        } else if (combo.fallback_model.includes('mixtral') || combo.fallback_model.includes('llama')) {
          fallbackProvider = 'groq';
        } else if (combo.fallback_model.startsWith('grok')) {
          fallbackProvider = 'xai';
        }

        const fallbackKeys = getActiveKeys(fallbackProvider);
        if (fallbackKeys.length > 0) {
           const fallbackKeyConfig = fallbackKeys[Math.floor(Math.random() * fallbackKeys.length)];
           try {
             let fallbackResult = await runRequest(fallbackProvider, fallbackKeyConfig, body);

             if (fallbackResult && fallbackResult.choices && fallbackResult.choices[0] && isChatEndpoint) {
               saveMemory(sessionId, (request.body as any).messages || [], fallbackResult.choices[0].message);
             }

             if (fallbackResult && fallbackResult.usage) {
               trackCost(fallbackProvider, combo.fallback_model, fallbackResult.usage, keyRecord.id);
             }

             if (useCache && isChatEndpoint && fallbackResult) {
               setCachedResponse(requestHash, fallbackResult);
             }
             return fallbackResult;
           } catch (fallbackErr: any) {
             fastify.log.error(`Fallback request failed: ${fallbackErr.message}`);
             return reply.status(500).send({ error: `Both primary and fallback failed. Fallback error: ${fallbackErr.message}` });
           }
        }
      }

      return reply.status(500).send({ error: err.message });
    }
  });
}
