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
    const isParallelCombo = combo && combo.fallback_model === 'PARALLEL'; // We use the fallback_model field string 'PARALLEL' to denote parallel MoA combos for now
    const actualModel = combo ? combo.primary_model : requestedModel;

    // Update the body model to the actual underlying model
    body.model = actualModel;

    const isChatEndpoint = request.url.includes('/chat/completions');

    // Explicitly disable upstream streaming so we can intercept, run tools, buffer, and re-emit chunks properly
    const requestedStream = body.stream;
    body.stream = false;

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

    // Load Balancing & Resilient Proxy Pool: Get active, non-rate-limited keys
    const getActiveKeys = (provider: string) => {
      let keys = db.prepare(`
        SELECT * FROM ProviderKeys
        WHERE provider_name = ?
        AND is_active = 1
        AND (rate_limit_until IS NULL OR rate_limit_until < CURRENT_TIMESTAMP)
        ORDER BY last_used ASC
      `).all(provider) as any[];

      if (!keys || keys.length === 0) {
        const fallbackConfig = db.prepare('SELECT * FROM ProviderConfigs WHERE provider_name = ?').get(provider);
        if (fallbackConfig) keys.push(fallbackConfig);
      }
      return keys;
    };

    let activeKeys = getActiveKeys(targetProvider);
    if (activeKeys.length === 0) {
      return reply.status(500).send({ error: `No configuration or active keys found (or all rate-limited) for provider: ${targetProvider}` });
    }

    // Select key (simple round-robin based on oldest last_used)
    let selectedKeyConfig = activeKeys[0];
    if (selectedKeyConfig.id && selectedKeyConfig.is_active !== undefined) {
      db.prepare('UPDATE ProviderKeys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(selectedKeyConfig.id);
    }

    const getTargetProvider = (mdl: string) => {
      if (mdl.includes('claude') || mdl.startsWith('anthropic:')) return 'anthropic';
      if (mdl.startsWith('gemini') || mdl.includes('google')) return 'google';
      if (mdl.startsWith('sonar') || mdl.includes('pplx')) return 'perplexity';
      if (mdl.includes('mixtral') || mdl.includes('gemma') || mdl.includes('llama')) return 'groq';
      if (mdl.startsWith('grok') || mdl.includes('xai')) return 'xai';
      return 'openai';
    };

    const runRequest = async (provider: string, keyConfig: any, currentBody: any) => {
      const executeAI = async (b: any) => {
        // Vision Preprocessor Adapter
        // Intercept messages and process images if the model doesn't natively support vision, or convert formats
        if (b.messages) {
          b.messages = b.messages.map((msg: any) => {
            if (Array.isArray(msg.content)) {
               // If a provider doesn't support vision, we'd ideally run OCR or clip here.
               // For now, we strip base64 to avoid crashing non-vision models, unless it's a known vision model
               const isVisionModel = b.model.includes('vision') || b.model.includes('gpt-4o') || b.model.includes('claude-3');
               if (!isVisionModel) {
                  const textContent = msg.content.filter((c:any) => c.type === 'text').map((c:any) => c.text).join('\n');
                  return { ...msg, content: textContent + '\n[Image stripped - model does not support vision]' };
               }
            }
            return msg;
          });
        }

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

    const handleProxyError = async (err: any, provider: string, keyConfig: any) => {
      const status = err.response?.status || 500;
      if (status === 429 || status === 401 || status === 403) {
        fastify.log.warn(`[Proxy Pool] Key failed (Status ${status}) for provider ${provider}. Disabling or rate limiting key ID ${keyConfig.id}`);
        if (keyConfig.id) {
          if (status === 429) {
             // Rate limited - backoff for 5 minutes
             db.prepare("UPDATE ProviderKeys SET rate_limit_until = datetime('now', '+5 minutes'), error_count = error_count + 1 WHERE id = ?").run(keyConfig.id);
          } else {
             // 401/403 - Invalid or exhausted quota - disable key
             db.prepare("UPDATE ProviderKeys SET is_active = 0, error_count = error_count + 1 WHERE id = ?").run(keyConfig.id);
          }
        }

        // Attempt to retry with another key from the pool
        activeKeys = getActiveKeys(provider);
        if (activeKeys.length > 0) {
           fastify.log.info(`[Proxy Pool] Retrying with alternative key for ${provider}`);
           selectedKeyConfig = activeKeys[0];
           if (selectedKeyConfig.id) db.prepare('UPDATE ProviderKeys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(selectedKeyConfig.id);
           return await runRequest(provider, selectedKeyConfig, body);
        }
      }
      throw err;
    };

    try {
      let finalResult;

      if (isParallelCombo) {
         // Parallel Combo (Mixture of Agents) Logic
         // For now, we query the primary_model and a few hardcoded high-tier models simultaneously
         // In a real scenario, the combo table would define the array of target models.
         const parallelModels = [actualModel, 'gpt-4o', 'claude-3-haiku-20240307'];

         fastify.log.info(`[Parallel Combo] Executing requests simultaneously to: ${parallelModels.join(', ')}`);

         const promises = parallelModels.map(async (m) => {
            const p = getTargetProvider(m);
            const pKeys = getActiveKeys(p);
            if (pKeys.length === 0) return null;
            const b = { ...body, model: m };
            try {
              return await runRequest(p, pKeys[0], b);
            } catch (e) {
              return null; // Ignore failures in parallel execution
            }
         });

         const results = await Promise.all(promises);
         const validResults = results.filter(r => r !== null && r.choices && r.choices.length > 0);

         if (validResults.length === 0) throw new Error("All parallel combo models failed.");

         // Select the longest response as a naive proxy for "best" or synthesize them.
         // We will just return the first valid one for simplicity, but prepend the model name
         finalResult = validResults.sort((a, b) => b.choices[0].message.content.length - a.choices[0].message.content.length)[0];
         finalResult.choices[0].message.content = `[Parallel MoA Synthesis Selected: ${finalResult.model}]\n\n${finalResult.choices[0].message.content}`;

      } else {
        try {
          finalResult = await runRequest(targetProvider, selectedKeyConfig, body);
        } catch (err: any) {
          finalResult = await handleProxyError(err, targetProvider, selectedKeyConfig);
        }
      }

      if (finalResult && finalResult.choices && finalResult.choices[0] && isChatEndpoint) {
        saveMemory(sessionId, (request.body as any).messages || [], finalResult.choices[0].message);
      }

      // Reset error count on success
      if (selectedKeyConfig.id) {
         db.prepare('UPDATE ProviderKeys SET error_count = 0 WHERE id = ?').run(selectedKeyConfig.id);
      }

      if (finalResult && finalResult.usage) {
        trackCost(targetProvider, actualModel, finalResult.usage, keyRecord.id);
      }

      if (useCache && isChatEndpoint && finalResult && !requestedStream) {
        setCachedResponse(requestHash, finalResult);
      }

      // Handle Streaming vs Non-Streaming response formats
      if (requestedStream && finalResult.choices?.[0]?.message) {
         reply.raw.setHeader('Content-Type', 'text/event-stream');
         reply.raw.setHeader('Cache-Control', 'no-cache');
         reply.raw.setHeader('Connection', 'keep-alive');

         const content = finalResult.choices[0].message.content;
         // Simulate streaming chunks for compatibility with frontends, even if the underlying tool-interceptor had to wait
         // In a purely passthrough proxy, we'd pipe the Axios stream directly. Because we run agentic tools, we buffer and emit.
         const chunkSize = 20;
         for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            const chunkData = {
               id: finalResult.id || 'chatcmpl-stream',
               object: 'chat.completion.chunk',
               created: Date.now(),
               model: finalResult.model,
               choices: [{ delta: { content: chunk }, index: 0, finish_reason: null }]
            };
            reply.raw.write(`data: ${JSON.stringify(chunkData)}\n\n`);
         }

         // Send final finish reason and usage if available
         const finalChunk = {
            id: finalResult.id || 'chatcmpl-stream',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: finalResult.model,
            choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
            usage: finalResult.usage
         };
         reply.raw.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
         reply.raw.write('data: [DONE]\n\n');
         reply.raw.end();
         return reply;
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
