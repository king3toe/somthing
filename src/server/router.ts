import { FastifyInstance } from 'fastify';
import db from '../db';
import { handleOpenAI } from '../adapters/openai';
import { handleAnthropic } from '../adapters/anthropic';
import { withToolInterceptor } from '../middleware/tools';
import { injectMemory, saveMemory } from '../middleware/memory';

export default async function routerRoutes(fastify: FastifyInstance) {
  // Wildcard route to handle /v1/chat/completions, /v1/models, etc.
  fastify.all('/v1/*', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const unifiedKey = authHeader.split(' ')[1];

    const keyRecord = db.prepare('SELECT * FROM UnifiedKeys WHERE key = ?').get(unifiedKey);
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid unified API key' });
    }

    // Pass through for non-POST requests (like GET /v1/models)
    if (request.method !== 'POST') {
       return reply.status(200).send({ data: [{ id: 'gpt-4o', object: 'model' }, { id: 'claude-3-opus', object: 'model' }] });
    }

    const body: any = request.body || {};
    const model = body.model || 'gpt-3.5-turbo';
    const isChatEndpoint = request.url.includes('/chat/completions');

    // Memory only applies to chat endpoints
    const sessionId = request.headers['x-session-id'] as string | undefined;
    if (isChatEndpoint && body.messages) {
      body.messages = injectMemory(sessionId, body.messages);
    }

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

      let finalResult;

      // Only apply tool interception to chat completions
      if (isChatEndpoint) {
        // Automatically inject registered tools into the body so the AI knows about them
        const tools = db.prepare('SELECT * FROM ToolConfigs').all() as any[];
        if (tools.length > 0) {
          body.tools = body.tools || [];
          for (const tool of tools) {
            // Simple generic schema injection (can be expanded via DB config)
            if (!body.tools.find((t: any) => t.function?.name === tool.tool_name)) {
               body.tools.push({
                 type: 'function',
                 function: {
                   name: tool.tool_name,
                   description: `Executes the ${tool.tool_name} tool API.`,
                   parameters: { type: 'object', properties: {} } // Flexible generic schema
                 }
               });
            }
          }
        }

        finalResult = await withToolInterceptor(executeAI, body);

        if (finalResult && finalResult.choices && finalResult.choices[0]) {
          saveMemory(sessionId, request.body as any, finalResult.choices[0].message);
        }
      } else {
        // Direct execution for things like /v1/embeddings
        finalResult = await executeAI(body);
      }

      return finalResult;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
