import { encryptKey, decryptKey, maskKey } from './auth/encryption';
import { verifyAdminToken, verifyPassword, generateAdminToken, updatePassword } from './auth';
import { FastifyInstance } from 'fastify';
import db from '../db';
import crypto from 'crypto';

export default async function apiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api/login')) return;
    if (!request.url.startsWith('/api/')) return;
    const token = request.cookies?.admin_token;
    if (!token || !verifyAdminToken(token)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.post('/api/login', async (request, reply) => {
    const { password } = request.body as any;
    if (verifyPassword(password)) {
      const token = generateAdminToken();
      reply.setCookie('admin_token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60
      });
      return { success: true };
    }
    return reply.status(401).send({ error: 'Invalid password' });
  });

  fastify.post('/api/logout', async (request, reply) => {
    reply.clearCookie('admin_token');
    return { success: true };
  });

  fastify.post('/api/change-password', async (request, reply) => {
    const { newPassword } = request.body as any;
    if (newPassword && newPassword.length >= 8) {
      updatePassword(newPassword);
      return { success: true };
    }
    return reply.status(400).send({ error: 'Password must be at least 8 characters' });
  });

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
  fastify.get('/api/providers', async () => {
    const rows = db.prepare('SELECT id, provider_name, api_key, base_url, is_active, weight, avg_latency_ms FROM ProviderKeys').all() as any[];
    return rows.map(r => ({ ...r, api_key: maskKey(r.api_key) }));
  });

  fastify.delete('/api/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('DELETE FROM ProviderKeys WHERE id = ?').run(id);
    return { success: true };
  });

  fastify.post('/api/providers', async (request, reply) => {
    const { provider_name, api_key, base_url, weight } = request.body as any;
    const encKey = encryptKey(api_key);
    const w = parseInt(weight) || 1;
    // Keep legacy ProviderConfigs updated for base_url
    db.prepare(`
      INSERT INTO ProviderConfigs (provider_name, api_key, base_url)
      VALUES (?, ?, ?)
      ON CONFLICT(provider_name) DO UPDATE SET
      api_key=excluded.api_key,
      base_url=excluded.base_url
    `).run(provider_name, encKey, base_url);

    // Insert into ProviderKeys to support multiple keys (Load Balancing)
    db.prepare(`
      INSERT INTO ProviderKeys (provider_name, api_key, base_url, weight)
      VALUES (?, ?, ?, ?)
    `).run(provider_name, encKey, base_url, w);

    return { success: true };
  });

  fastify.post('/api/providers/reset/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('UPDATE ProviderKeys SET is_active = 1, rate_limit_until = NULL, error_count = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // === TOOLS ===
  fastify.get('/api/tools', async () => {
    const rows = db.prepare('SELECT * FROM ToolConfigs').all() as any[];
    return rows.map(r => ({ ...r, api_key: maskKey(r.api_key) }));
  });

  fastify.delete('/api/tools/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('DELETE FROM ToolConfigs WHERE id = ?').run(id);
    return { success: true };
  });

  fastify.post('/api/tools', async (request, reply) => {
    const { tool_name, api_key, base_url } = request.body as any;
    const encKey = encryptKey(api_key);
    db.prepare(`
      INSERT INTO ToolConfigs (tool_name, api_key, base_url)
      VALUES (?, ?, ?)
      ON CONFLICT(tool_name) DO UPDATE SET
      api_key=excluded.api_key,
      base_url=excluded.base_url
    `).run(tool_name, encKey, base_url);
    return { success: true };
  });

  // === COMBOS ===
  fastify.delete('/api/combos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('DELETE FROM Combos WHERE id = ?').run(id);
    return { success: true };
  });

  fastify.post('/api/combos', async (request, reply) => {
    const { name, mode, models_json } = request.body as any;
    db.prepare('INSERT INTO Combos (name, mode, models_json) VALUES (?, ?, ?)')
      .run(name, mode || 'sequential', models_json || '[]');
    return { success: true };
  });

  fastify.get('/api/combos', async () => {
    return db.prepare('SELECT * FROM Combos').all();
  });

  // === REGISTRY ===
  fastify.get('/api/registry', async () => {
    return db.prepare('SELECT * FROM ModelRegistry').all();
  });

  // === USAGE ===
  fastify.get('/api/usage', async () => {
    return db.prepare('SELECT provider, model, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens, SUM(cost_usd) as total_cost FROM CostTracking GROUP BY provider, model').all();
  });

  fastify.get('/api/quotas', async () => {
    // Get aggregated cost per Unified Key
    const costs = db.prepare('SELECT unified_key_id, SUM(cost_usd) as used_usd FROM CostTracking GROUP BY unified_key_id').all() as any[];
    const keys = db.prepare('SELECT id, name FROM UnifiedKeys').all() as any[];

    return keys.map(k => {
      const usageRec = costs.find(c => c.unified_key_id === k.id);
      return {
        id: k.id,
        name: k.name,
        used_usd: usageRec ? usageRec.used_usd : 0,
        // In a real app, this limit would be stored in the DB. We default to $10 for the UI demo.
        limit_usd: 10.00
      };
    });
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
  fastify.get('/api/media', async () => {
    const rows = db.prepare('SELECT * FROM MediaProviders').all() as any[];
    return rows.map(r => ({ ...r, api_key: maskKey(r.api_key) }));
  });

  fastify.delete('/api/media/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('DELETE FROM MediaProviders WHERE id = ?').run(id);
    return { success: true };
  });

  fastify.post('/api/media', async (request, reply) => {
    const { provider_name, api_key } = request.body as any;
    const encKey = encryptKey(api_key);
    db.prepare(`
      INSERT INTO MediaProviders (provider_name, api_key)
      VALUES (?, ?)
      ON CONFLICT(provider_name) DO UPDATE SET api_key=excluded.api_key
    `).run(provider_name, encKey);
    return { success: true };
  });
}
