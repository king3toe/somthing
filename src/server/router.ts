import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getProviderKeys } from '../db';
import { streamOpenAI, completeOpenAI } from '../adapters/openai';
import { streamAnthropic, completeAnthropic } from '../adapters/anthropic';
import { resolveAndCheckIP } from '../middleware/ssrf';
import { runAgentStream, toSSE, withErrorPolicy } from '../middleware/stream_coordinator';
import { decryptKey } from './auth/encryption';
import { Readable } from 'stream';
import crypto from 'crypto';

export default async function router(fastify: FastifyInstance) {
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const body: any = request.body;
    const requestedStream = body.stream === true;

    const keys = getProviderKeys();
    if (!keys || keys.length === 0) {
      return reply.status(503).send({ error: 'No provider keys configured' });
    }

    const sortedKeys = keys.sort((a, b) => a.priority - b.priority);
    const topPriority = sortedKeys[0].priority;
    const candidates = sortedKeys.filter(k => k.priority === topPriority);

    let selectedProvider = candidates[0];
    if (candidates.length > 1) {
       const totalWeight = candidates.reduce((sum, k) => sum + (k.weight || 1), 0);
       let rand = Math.random() * totalWeight;
       for (const candidate of candidates) {
          rand -= (candidate.weight || 1);
          if (rand <= 0) {
             selectedProvider = candidate;
             break;
          }
       }
    }

    if (selectedProvider.base_url) {
      try {
        const urlObj = new URL(selectedProvider.base_url);
        await resolveAndCheckIP(urlObj.hostname);
      } catch (e: any) {
        return reply.status(400).send({ error: `SSRF Protection Blocked Request: ${e.message}` });
      }
    }

    const abortController = new AbortController();
    request.raw.on('close', () => {
      if (!reply.raw.writableEnded) {
         abortController.abort(new Error("client_disconnected"));
      }
    });

    request.raw.on('aborted', () => {
      abortController.abort(new Error("client_disconnected"));
    });

    const runtimeProvider = { ...selectedProvider, api_key: decryptKey(selectedProvider.api_key) };
    const ctx = { ...body, signal: abortController.signal };

    const metricsCallback = (metrics: any) => {
      setTimeout(() => {
        try {
           const { ttft_ms, latency_ms, errorCount, usage } = metrics;
           const db = require('../db').default;

           db.prepare(`
              UPDATE ProviderKeys
              SET last_used = CURRENT_TIMESTAMP,
                  error_count = error_count + ?,
                  avg_latency_ms = CASE
                    WHEN avg_latency_ms = 0 THEN ?
                    ELSE (avg_latency_ms + ?) / 2
                  END,
                  ttft_ms = CASE
                    WHEN ttft_ms = 0 THEN ?
                    ELSE (ttft_ms + ?) / 2
                  END
              WHERE id = ?
           `).run(errorCount, latency_ms, latency_ms, ttft_ms || 0, ttft_ms || 0, selectedProvider.id);

           if (usage) {
               db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?)').run(
                  selectedProvider.provider_name,
                  body.model || 'unknown',
                  usage.prompt_tokens || 0,
                  usage.completion_tokens || 0
               );
           }
        } catch(e) {
           fastify.log.error('Failed to save metrics: ' + e);
        }
      }, 0);
    };

    if (requestedStream) {
       const completionId = `chatcmpl-${crypto.randomUUID()}`;
       reply
         .header("content-type", "text/event-stream; charset=utf-8")
         .header("cache-control", "no-cache, no-transform")
         .header("connection", "keep-alive")
         .header("x-accel-buffering", "no")
         .header("x-everyroute-stream-mode", "native");

       const adapterFn = () => selectedProvider.provider_name.toLowerCase() === 'anthropic'
         ? streamAnthropic(runtimeProvider, ctx)
         : streamOpenAI(runtimeProvider, ctx);

       const events = withErrorPolicy(runAgentStream(adapterFn, ctx, metricsCallback));
       const streamEvents = Readable.from(toSSE(events, completionId), { objectMode: false });
       streamEvents.on('error', (err) => {
          fastify.log.error('Stream generation error: ' + err.message);
          // Don't throw if socket already writableEnded, just end cleanly
       });
       return reply.send(streamEvents);
    } else {
       try {
         const response = selectedProvider.provider_name.toLowerCase() === 'anthropic'
           ? await completeAnthropic(runtimeProvider, ctx)
           : await completeOpenAI(runtimeProvider, ctx);

         metricsCallback({ ttft_ms: 0, latency_ms: 0, errorCount: 0, usage: response.usage });

         return reply.send({
           id: `chatcmpl-${crypto.randomUUID()}`,
           object: 'chat.completion',
           created: Math.floor(Date.now() / 1000),
           model: body.model || 'unknown',
           choices: [{
             index: 0,
             message: { role: 'assistant', content: response.content },
             finish_reason: response.finishReason
           }],
           usage: response.usage
         });
       } catch (e: any) {
         metricsCallback({ ttft_ms: 0, latency_ms: 0, errorCount: 1, usage: null });
         return reply.status(500).send({ error: e.message || 'Internal Server Error' });
       }
    }
  });
}
