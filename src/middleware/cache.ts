import crypto from 'crypto';
import db from '../db';

export const generateCacheHash = (body: any): string => {
  // Omit fields that shouldn't affect the cache (like streaming, etc)
  // For semantic caching, we normalize the messages by lowercasing and trimming spaces
  const normalizeMessages = (msgs: any[]) => {
    if (!msgs) return [];
    return msgs.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.trim().toLowerCase() : m.content
    }));
  };

  const cacheableBody = {
    model: body.model,
    messages: normalizeMessages(body.messages),
    tools: body.tools ? JSON.stringify(body.tools) : undefined,
  };
  return crypto.createHash('sha256').update(JSON.stringify(cacheableBody)).digest('hex');
};

export const getCachedResponse = (requestHash: string) => {
  // Get responses that were created within the last 24 hours to avoid stale data
  const row = db.prepare(`
    SELECT response_json
    FROM RequestCache
    WHERE request_hash = ? AND created_at >= datetime('now', '-1 day')
  `).get(requestHash) as { response_json: string } | undefined;

  if (row) {
    try {
      const resp = JSON.parse(row.response_json);
      // Mark as a cached response for client tracking
      if (resp.usage) {
         resp.usage.is_cached = true;
         resp.usage.prompt_tokens = 0; // Semantic cache saves you tokens!
      }
      return resp;
    } catch (e) {
      console.error('Failed to parse cached response:', e);
      return null;
    }
  }
  return null;
};

export const setCachedResponse = (requestHash: string, response: any) => {
  try {
    const responseJson = JSON.stringify(response);
    db.prepare(`
      INSERT INTO RequestCache (request_hash, response_json)
      VALUES (?, ?)
      ON CONFLICT(request_hash) DO UPDATE SET
      response_json=excluded.response_json,
      created_at=CURRENT_TIMESTAMP
    `).run(requestHash, responseJson);
  } catch (e) {
    console.error('Failed to cache response:', e);
  }
};
