import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getProviderKeys } from '../db';
import { handleOpenAI } from '../adapters/openai';
import { handleAnthropic } from '../adapters/anthropic';
import { resolveAndCheckIP } from '../middleware/ssrf';
import { runAgentStream, toSSE } from '../middleware/stream_coordinator';
import { decryptKey } from './auth/encryption';
import { Readable } from 'stream';

function asyncGeneratorToReadable(gen: AsyncGenerator<string, void, unknown>): Readable {
  return Readable.from(gen);
}

export default async function router(fastify: FastifyInstance) {
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const providedKey = authHeader.split(' ')[1];

    const body: any = request.body;
    const isStream = body.stream === true;

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
         abortController.abort();
      }
    });

    request.raw.on('aborted', () => {
      abortController.abort();
    });

    try {
      let adapterStream;
      const runtimeProvider = { ...selectedProvider, api_key: decryptKey(selectedProvider.api_key) };

      if (selectedProvider.provider_name.toLowerCase() === 'anthropic') {
        adapterStream = handleAnthropic(runtimeProvider, body, isStream, abortController.signal);
      } else {
        adapterStream = handleOpenAI(runtimeProvider, body, isStream, abortController.signal);
      }

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
                    END
                WHERE id = ?
             `).run(errorCount, latency_ms, latency_ms, selectedProvider.id);

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
      const coordinatedStream = runAgentStream(adapterStream, abortController.signal, metricsCallback);

      if (isStream) {
        reply.header('Content-Type', 'text/event-stream');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');

        const sseStream = toSSE(coordinatedStream);
        return reply.send(asyncGeneratorToReadable(sseStream));
      } else {
        let content = '';
        let finishReason = 'stop';
        let usage = null;

        for await (const event of coordinatedStream) {
           if (event.type === 'content') content += event.text;
           if (event.type === 'usage') usage = event.usage;
           if (event.type === 'finish') finishReason = event.reason || 'stop';
           if (event.type === 'error') throw event.error;
        }

        return reply.send({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model || 'unknown',
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: finishReason
          }],
          usage
        });
      }
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: error.message || 'Internal Server Error' });
    }
  });
}
