import { FastifyInstance } from 'fastify';
import db from '../db';
import crypto from 'crypto';

export default async function apiRoutes(fastify: FastifyInstance) {
  // Get all unified keys
  fastify.get('/api/keys', async () => {
    return db.prepare('SELECT id, key, name, created_at FROM UnifiedKeys').all();
  });

  // Create new unified key
  fastify.post('/api/keys', async (request, reply) => {
    const { name } = request.body as { name: string };
    const newKey = 'omni-' + crypto.randomBytes(24).toString('hex');

    db.prepare('INSERT INTO UnifiedKeys (key, name) VALUES (?, ?)').run(newKey, name || 'Default');
    return { success: true, key: newKey };
  });

  // Save Provider Config
  fastify.post('/api/providers', async (request, reply) => {
    const { provider_name, api_key, base_url } = request.body as any;

    db.prepare(`
      INSERT INTO ProviderConfigs (provider_name, api_key, base_url)
      VALUES (?, ?, ?)
      ON CONFLICT(provider_name) DO UPDATE SET
      api_key=excluded.api_key,
      base_url=excluded.base_url
    `).run(provider_name, api_key, base_url);

    return { success: true };
  });

  // Save Tool Config
  fastify.post('/api/tools', async (request, reply) => {
    const { tool_name, api_key, base_url } = request.body as any;

    db.prepare(`
      INSERT INTO ToolConfigs (tool_name, api_key, base_url)
      VALUES (?, ?, ?)
      ON CONFLICT(tool_name) DO UPDATE SET
      api_key=excluded.api_key,
      base_url=excluded.base_url
    `).run(tool_name, api_key, base_url);

    return { success: true };
  });
}
