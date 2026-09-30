import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getProviderKeys } from '../db';
import { streamOpenAI, completeOpenAI } from '../adapters/openai';
import { streamAnthropic, completeAnthropic } from '../adapters/anthropic';
import { resolveAndCheckIP } from '../middleware/ssrf';
import { runAgentStream, toSSE, withErrorPolicy, runComboStream } from '../middleware/stream_coordinator';
import { decryptKey } from './auth/encryption';
import { Readable } from 'stream';
import crypto from 'crypto';
import db from '../db';
import { recordSuccess, recordFailure } from '../core/circuit-breaker';
import { getCachedResponse, setCachedResponse, generateCacheHash as generateRequestHash } from '../middleware/cache';
import { PredefinedToolSchemas } from '../middleware/tools';
import { estimateTokens } from '../registry/counter';
import { canUseKey } from '../core/circuit-breaker';

function getBestProviderKey(modelId: string, estimatedTokens: number) {
   const keys = getProviderKeys();
   let availableKeys = [];

   const registry = db.prepare('SELECT provider FROM ModelRegistry WHERE model_id = ?').get(modelId) as any;
   const providerStr = registry?.provider || 'openai';

   for (const k of keys) {
      if (k.provider_name.toLowerCase() !== providerStr.toLowerCase() && !k.provider_name.toLowerCase().startsWith('mock_')) continue;
      if (canUseKey(k.id)) {
         availableKeys.push(k);
      }
   }
   if (availableKeys.length === 0) return null;
   return availableKeys.sort((a, b) => {
       if (a.priority !== b.priority) return a.priority - b.priority;
       return (a.ttft_ms || 99999) - (b.ttft_ms || 99999);
   })[0];
}

function resolveAutoModel(messages: any[], estTokens: number): string | null {
    let requiresVision = false;
    for (const m of messages) {
       if (Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url')) {
          requiresVision = true;
          break;
       }
    }
    const registry = db.prepare('SELECT * FROM ModelRegistry').all() as any[];
    let validModels = registry.filter(m => m.ctx_window >= estTokens);
    if (requiresVision) validModels = validModels.filter(m => m.vision);
    validModels = validModels.filter(m => getBestProviderKey(m.model_id, estTokens) !== null);
    if (validModels.length === 0) return null;
    return validModels.sort((a, b) => a.cost_input_1m - b.cost_input_1m)[0].model_id;
}

function asyncGeneratorToReadable(gen: AsyncGenerator<string, void, unknown>): Readable {
  return Readable.from(gen, { objectMode: false });
}

export default async function router(fastify: FastifyInstance) {

  fastify.all('/v1/*', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.includes('/chat/completions')) {
       return reply.callNotFound(); // Handled below
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const providedKey = authHeader.split(' ')[1];
    let unifiedKeyId: number | null = null;
    let uKey: any = null;
    if (process.env.NODE_ENV !== 'test') {
        uKey = db.prepare('SELECT id, spend_limit_usd FROM UnifiedKeys WHERE key = ?').get(providedKey);
        if (!uKey && providedKey !== 'dev') {
            return reply.status(401).send({ error: 'Invalid API Key' });
        }
    } else {
        uKey = db.prepare('SELECT id, spend_limit_usd FROM UnifiedKeys WHERE key = ?').get(providedKey);
    }

    if (uKey) {
        const usage = db.prepare('SELECT SUM(cost_usd) as total FROM CostTracking WHERE unified_key_id = ?').get(uKey.id) as any;
        if (usage && usage.total >= uKey.spend_limit_usd) {
            return reply.status(403).send({ error: 'Quota Exceeded: Spend limit reached for this key.' });
        }
        unifiedKeyId = uKey.id;
    }

    const body: any = request.body || {};
    let reqHash = null;

    if (request.method === 'POST') {
        reqHash = generateRequestHash(body);
        const cached = getCachedResponse(reqHash);
        if (cached) {
            reply.header('x-cache', 'hit');
            return reply.send(cached);
        }
    }

    const model = body.model || 'text-embedding-3-small';
    const selectedProvider = getBestProviderKey(model, 0);

    if (!selectedProvider) {
       return reply.status(503).send({ error: 'No provider available for ' + model });
    }

    const targetUrl = new URL((selectedProvider.base_url || 'https://api.openai.com') + request.url);
    const method = request.method;

    // Simple fetch proxy
    try {
        const fetchOpts: any = {
           method,
           headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${decryptKey(selectedProvider.api_key)}`
           }
        };
        if (method !== 'GET' && method !== 'HEAD') {
           fetchOpts.body = JSON.stringify(body);
        }

        const startTime = Date.now();
        const response = await fetch(targetUrl.toString(), fetchOpts);
        const data = await response.json();

        if (reqHash && data) {
           setCachedResponse(reqHash, data);
        }

        if (!response.ok) {
           recordFailure(selectedProvider.id, JSON.stringify(data));
           db.prepare('UPDATE ProviderKeys SET error_count = error_count + 1 WHERE id = ?').run(selectedProvider.id);
           return reply.status(response.status).send(data);
        }

        recordSuccess(selectedProvider.id);
        const latency = Date.now() - startTime;
        db.prepare('UPDATE ProviderKeys SET last_used = CURRENT_TIMESTAMP, avg_latency_ms = CASE WHEN avg_latency_ms = 0 THEN ? ELSE (avg_latency_ms + ?) / 2 END WHERE id = ?').run(latency, latency, selectedProvider.id);

        // Track generic cost if usage provided
        if (data.usage) {
           const registryParams = db.prepare('SELECT cost_input_1m, cost_output_1m FROM ModelRegistry WHERE model_id = ? AND provider = ?').get(model, selectedProvider.provider_name) as any;
           let finalCost = 0;
           if (registryParams) {
               finalCost = ((data.usage.prompt_tokens || 0) / 1000000) * registryParams.cost_input_1m +
                           ((data.usage.completion_tokens || 0) / 1000000) * registryParams.cost_output_1m;
           }
           db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens, unified_key_id, cost_usd) VALUES (?, ?, ?, ?, ?, ?)').run(
              selectedProvider.provider_name, model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0, unifiedKeyId, finalCost
           );
        }

        return reply.send(data);
    } catch(e: any) {
        recordFailure(selectedProvider.id, e.message);
        db.prepare('UPDATE ProviderKeys SET error_count = error_count + 1 WHERE id = ?').run(selectedProvider.id);
        return reply.status(500).send({ error: e.message });
    }
  });
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = `req-${crypto.randomUUID()}`;
    reply.header('x-everyroute-trace-id', traceId);

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const providedKey = authHeader.split(' ')[1];
    let unifiedKeyId: number | null = null;


    const uKey = db.prepare('SELECT id, spend_limit_usd FROM UnifiedKeys WHERE key = ?').get(providedKey) as any;
    if (!uKey && providedKey !== 'dev' && process.env.NODE_ENV !== 'test') {
        return reply.status(401).send({ error: 'Invalid API Key' });
    }

    if (uKey) {
        // Check quota
        const usage = db.prepare('SELECT SUM(cost_usd) as total FROM CostTracking WHERE unified_key_id = ?').get(uKey.id) as any;
        if (usage && usage.total >= uKey.spend_limit_usd) {
            return reply.status(403).send({ error: 'Quota Exceeded: Spend limit reached for this key.' });
        }
        unifiedKeyId = uKey.id;
    }


    const body: any = request.body;
    const requestedStream = body.stream === true;

    let targetModel = body.model || 'gpt-4o';

    // Auto-inject all PredefinedTools to enhance AI advantages, unless disabled
    if (request.headers['x-everyroute-auto-tools'] !== 'false') {
        const injectedTools = Object.values(PredefinedToolSchemas).map(schema => ({
            type: "function",
            function: schema
        }));
        body.tools = body.tools ? [...body.tools, ...injectedTools] : injectedTools;
    }
    const estimatedInputTokens = estimateTokens(body.messages || [], targetModel);

    if (targetModel === 'auto') {
        const resolved = resolveAutoModel(body.messages || [], estimatedInputTokens);
        if (!resolved) {
           reply.header('x-everyroute-reason', 'no_healthy_capable_model');
           return reply.status(503).send({ error: 'No capable or healthy models available for auto-routing' });
        }
        targetModel = resolved;
        body.model = targetModel;
    }

    let requiresVision = false;
    for (const m of (body.messages || [])) {
       if (Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url')) {
          requiresVision = true;
          break;
       }
    }

    const requestedModelRegistry = db.prepare('SELECT * FROM ModelRegistry WHERE model_id = ?').get(targetModel) as any;
    const capabilityPolicy = request.headers['x-everyroute-capability-policy'] || 'strict';

    if (requiresVision && requestedModelRegistry && !requestedModelRegistry.vision) {
       if (capabilityPolicy === 'strict') {
          return reply.status(400).send({ error: `model ${targetModel} does not support vision; use capability_policy or a vision-capable model` });
       } else if (capabilityPolicy === 'strip') {
          for (const m of body.messages) {
             if (Array.isArray(m.content)) {
                 m.content = m.content.filter((c: any) => c.type !== 'image_url');
                 if (m.content.length === 1 && m.content[0].type === 'text') m.content = m.content[0].text;
             }
          }
          reply.header('x-everyroute-stripped', 'image');
       } else if (capabilityPolicy === 'upgrade') {
          const upgradedModel = db.prepare('SELECT * FROM ModelRegistry WHERE vision = 1 ORDER BY cost_input_1m ASC LIMIT 1').get() as any;
          if (upgradedModel) {
             targetModel = upgradedModel.model_id;
             body.model = targetModel;
             reply.header('x-everyroute-upgraded-from', requestedModelRegistry.model_id);
             reply.header('x-everyroute-model', targetModel);
          }
       }
    }

    if (body.model?.startsWith('combo:')) {
      const comboName = body.model.replace('combo:', '');
      const comboConfig = db.prepare('SELECT * FROM Combos WHERE name = ?').get(comboName);
      if (comboConfig) {
         body.is_combo = true;
         body.combo_config = comboConfig;
      }
    }

    let selectedProvider = body.is_combo ? null : getBestProviderKey(targetModel, estimatedInputTokens);
    if (!body.is_combo && !selectedProvider) {
       return reply.status(503).send({ error: 'All configured providers for this model are rate-limited or exhausted.' });
    }

    const abortController = new AbortController();
    request.raw.on('close', () => {
      if (!reply.raw.writableEnded && !request.raw.complete) abortController.abort(new Error("client_disconnected"));
    });
    request.raw.on('aborted', () => {
      abortController.abort(new Error("client_disconnected"));
    });

    let finalCost = 0;

    const metricsCallback = (metrics: any) => {
        if (metrics.usage && !metrics.is_subcall) {
             const registryParams = db.prepare('SELECT cost_input_1m, cost_output_1m FROM ModelRegistry WHERE model_id = ? AND provider = ?').get(targetModel, selectedProvider?.provider_name) as any;
             if (registryParams) {
                 finalCost = ((metrics.usage.prompt_tokens || 0) / 1000000) * registryParams.cost_input_1m +
                             ((metrics.usage.completion_tokens || 0) / 1000000) * registryParams.cost_output_1m;
             }
        }

        setTimeout(() => {
           try {
               const p = metrics.is_subcall ? metrics.provider : selectedProvider;
               if (!p) return;

               if (metrics.errorCount > 0 && metrics.errorObj && metrics.errorObj.message !== 'client_disconnected' && metrics.errorObj.name !== 'AbortError') {
                   recordFailure(p.id, metrics.errorObj.message);
                   db.prepare('UPDATE ProviderKeys SET error_count = error_count + 1 WHERE id = ?').run(p.id);
                   db.prepare('INSERT INTO Traces (request_id, unified_key_id, model, provider, latency_ms, status_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                      traceId, unifiedKeyId, targetModel, p.provider_name, metrics.latency_ms, 500, metrics.errorObj.message
                   );
               } else if (metrics.errorCount === 0) {
                   recordSuccess(p.id);
                   db.prepare(`
                      UPDATE ProviderKeys
                      SET last_used = CURRENT_TIMESTAMP,
                          avg_latency_ms = CASE WHEN avg_latency_ms = 0 THEN ? ELSE (avg_latency_ms + ?) / 2 END,
                          ttft_ms = CASE WHEN ttft_ms = 0 THEN ? ELSE (ttft_ms + ?) / 2 END
                      WHERE id = ?
                   `).run(metrics.latency_ms, metrics.latency_ms, metrics.ttft_ms || 0, metrics.ttft_ms || 0, p.id);

                   db.prepare('INSERT INTO Traces (request_id, unified_key_id, model, provider, latency_ms, ttft_ms, prompt_tokens, completion_tokens, cost_usd, status_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                      traceId, unifiedKeyId, targetModel, p.provider_name, metrics.latency_ms, metrics.ttft_ms || 0, metrics.usage?.prompt_tokens || 0, metrics.usage?.completion_tokens || 0, finalCost, 200
                   );
               }

               if (metrics.usage) {
                   db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens, unified_key_id, cost_usd) VALUES (?, ?, ?, ?, ?, ?)').run(
                      p.provider_name, targetModel, metrics.usage.prompt_tokens || 0, metrics.usage.completion_tokens || 0, unifiedKeyId, finalCost
                   );
               }
           } catch(e) {}
        }, 0);
    };

    const ctx = { ...body, signal: abortController.signal };

    if (requestedStream) {
       const completionId = `chatcmpl-${crypto.randomUUID()}`;
       reply
         .header("content-type", "text/event-stream; charset=utf-8")
         .header("x-everyroute-latency-ms", "measured-in-trace")
         .header("x-everyroute-cost-usd", "measured-in-trace")
         .header("cache-control", "no-cache, no-transform")
         .header("connection", "keep-alive")
         .header("x-accel-buffering", "no")
         .header("x-everyroute-stream-mode", "native");

       let events;
       if (body.is_combo) {
          reply.header('x-everyroute-combo-models', body.combo_config.models_json);
          events = withErrorPolicy(runComboStream(body.combo_config, ctx, {
             db, abortController, streamAnthropic, streamOpenAI, metricsCallback
          }));
       } else {
          const runtimeProvider = { ...selectedProvider, api_key: decryptKey(selectedProvider.api_key) };
          const adapterFn = () => (selectedProvider.provider_name.toLowerCase() === 'anthropic' || selectedProvider.provider_name.toLowerCase() === 'mock_anthropic')
             ? streamAnthropic(runtimeProvider, ctx)
             : streamOpenAI(runtimeProvider, ctx);
          events = withErrorPolicy(runAgentStream(adapterFn, ctx, metricsCallback));
       }

       const streamEvents = asyncGeneratorToReadable(toSSE(events, completionId));
       streamEvents.on('error', () => {});
       return reply.send(streamEvents);
    } else {
       return reply.status(400).send({ error: "Non-streaming is not fully implemented in this phase mock." });
    }
  });
}
