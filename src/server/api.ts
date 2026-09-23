import { FastifyInstance } from 'fastify';
import db from '../db';
import crypto from 'crypto';

export default async function apiRoutes(fastify: FastifyInstance) {
  // === KEYS ===
  fastify.get('/api/keys', async () => {
    return db.prepare('SELECT id, key, name, created_at FROM UnifiedKeys').all();
  });

  fastify.post('/api/keys', async (request, reply) => {
    const { name } = request.body as { name: string };
    const newKey = 'everyroute-' + crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO UnifiedKeys (key, name) VALUES (?, ?)').run(newKey, name || 'Default');
    return { success: true, key: newKey };
  });

  // === PROVIDERS ===
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

  // === TOOLS ===
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

  // === COMBOS ===
  fastify.post('/api/combos', async (request, reply) => {
    const { name, primary_model, fallback_model } = request.body as any;
    db.prepare('INSERT INTO Combos (name, primary_model, fallback_model) VALUES (?, ?, ?)').run(name, primary_model, fallback_model);
    return { success: true };
  });

  fastify.get('/api/combos', async () => {
    return db.prepare('SELECT * FROM Combos').all();
  });

  // === USAGE ===
  fastify.get('/api/usage', async () => {
    return db.prepare('SELECT provider, model, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens, SUM(cost_usd) as total_cost FROM CostTracking GROUP BY provider, model').all();
  });

  // === SYSTEM CONFIGS (Quota, Token Saver, Proxy, Remote, English) ===
  fastify.get('/api/configs', async () => {
    const rows = db.prepare('SELECT * FROM SystemConfigs').all() as any[];
    return rows.reduce((acc, row) => ({ ...acc, [row.config_key]: row.config_value }), {});
  });

  fastify.post('/api/configs', async (request, reply) => {
    const { key, value } = request.body as any;
    db.prepare(`
      INSERT INTO SystemConfigs (config_key, config_value)
      VALUES (?, ?)
      ON CONFLICT(config_key) DO UPDATE SET
      config_value=excluded.config_value
    `).run(key, value);
    return { success: true };
  });

  // === MEDIA PROVIDERS ===
  fastify.post('/api/media', async (request, reply) => {
    const { provider_name, api_key } = request.body as any;
    db.prepare(`
      INSERT INTO MediaProviders (provider_name, api_key)
      VALUES (?, ?)
      ON CONFLICT(provider_name) DO UPDATE SET api_key=excluded.api_key
    `).run(provider_name, api_key);
    return { success: true };
  });
}
