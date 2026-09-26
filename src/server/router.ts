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
import { estimateTokens } from '../registry/counter';
import { canUseKey, recordSuccess, recordFailure } from '../core/circuit-breaker';

function getBestProviderKey(modelId: string, estimatedTokens: number) {
   const keys = getProviderKeys();
   let availableKeys = [];

   const registry = db.prepare('SELECT provider FROM ModelRegistry WHERE model_id = ?').get(modelId) as any;
   const providerStr = registry?.provider || 'openai';

   for (const k of keys) {
      if (k.provider_name.toLowerCase() !== providerStr.toLowerCase() && k.provider_name.toLowerCase() !== 'mock_openai') continue;
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
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const body: any = request.body;
    const requestedStream = body.stream === true;

    let targetModel = body.model || 'gpt-4o';
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

    // Check capabilities
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
         if ((comboConfig as any).models_json.includes('combo:')) {
            return reply.status(400).send({ error: 'Nested combo cycles are not permitted.' });
         }
         body.is_combo = true;
         body.combo_config = comboConfig;
      }
    }

    // Pick key
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

    const metricsCallback = (metrics: any) => {
        // Run synchronously to ensure CircuitBreaker remains atomic on failures/successes
        const p = metrics.is_subcall ? metrics.provider : selectedProvider;
        if (p) {
            if (metrics.errorCount > 0 && metrics.errorObj) {
                recordFailure(p.id, metrics.errorObj.message);
                // Async persist error counter
                setTimeout(() => {
                    try { db.prepare('UPDATE ProviderKeys SET error_count = error_count + 1 WHERE id = ?').run(p.id); } catch(e){}
                }, 0);
            } else if (metrics.errorCount === 0) {
                recordSuccess(p.id);
                // Async persist averages
                setTimeout(() => {
                    try {
                        db.prepare(`
                          UPDATE ProviderKeys
                          SET last_used = CURRENT_TIMESTAMP,
                              avg_latency_ms = CASE WHEN avg_latency_ms = 0 THEN ? ELSE (avg_latency_ms + ?) / 2 END,
                              ttft_ms = CASE WHEN ttft_ms = 0 THEN ? ELSE (ttft_ms + ?) / 2 END
                          WHERE id = ?
                        `).run(metrics.latency_ms, metrics.latency_ms, metrics.ttft_ms || 0, metrics.ttft_ms || 0, p.id);
                    } catch(e) {}
                }, 0);
            }

            if (metrics.usage) {
               setTimeout(() => {
                   try {
                       db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?)').run(
                          p.provider_name, targetModel, metrics.usage.prompt_tokens || 0, metrics.usage.completion_tokens || 0
                       );
                   } catch(e) {}
               }, 0);
            }
        }
    };

    const ctx = { ...body, signal: abortController.signal };

    if (requestedStream) {
       const completionId = `chatcmpl-${crypto.randomUUID()}`;
       reply
         .header("content-type", "text/event-stream; charset=utf-8")
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
          const adapterFn = () => selectedProvider.provider_name.toLowerCase() === 'anthropic'
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
