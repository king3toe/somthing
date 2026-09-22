import { FastifyInstance } from 'fastify';
import db from '../db';
import { handleOpenAI } from '../adapters/openai';
import { handleAnthropic } from '../adapters/anthropic';
import { withToolInterceptor } from '../middleware/tools';
import { injectMemory, saveMemory } from '../middleware/memory';

export default async function routerRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/chat/completions', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const unifiedKey = authHeader.split(' ')[1];

    const keyRecord = db.prepare('SELECT * FROM UnifiedKeys WHERE key = ?').get(unifiedKey);
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid unified API key' });
    }

    const body: any = request.body;
    const model = body.model || 'gpt-3.5-turbo';

    // Check for custom session ID header for memory tracking
    const sessionId = request.headers['x-session-id'] as string | undefined;

    // Inject memory into the messages
    body.messages = injectMemory(sessionId, body.messages);

    let targetProvider = 'openai';
    if (model.includes('claude') || model.startsWith('anthropic:')) {
      targetProvider = 'anthropic';
    }

    const providerConfig = db.prepare('SELECT * FROM ProviderConfigs WHERE provider_name = ?').get(targetProvider);

    if (!providerConfig) {
      return reply.status(500).send({ error: `No configuration found for provider: ${targetProvider}` });
    }

    try {
      const executeAI = async (currentBody: any) => {
        if (targetProvider === 'openai') {
          return await handleOpenAI(providerConfig, currentBody);
        } else if (targetProvider === 'anthropic') {
          return await handleAnthropic(providerConfig, currentBody);
        }
      };

      // Wrap the AI execution in the Tool Interceptor
      const finalResult = await withToolInterceptor(executeAI, body);

      // Save memory of the interaction
      if (finalResult && finalResult.choices && finalResult.choices[0]) {
        saveMemory(sessionId, request.body as any, finalResult.choices[0].message);
      }

      return finalResult;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
