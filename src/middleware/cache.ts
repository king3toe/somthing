import crypto from 'crypto';
import db from '../db';

export const generateCacheHash = (body: any): string => {
  // Omit fields that shouldn't affect the cache (like streaming, etc)
  const cacheableBody = {
    model: body.model,
    messages: body.messages,
    tools: body.tools,
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
  };
  return crypto.createHash('sha256').update(JSON.stringify(cacheableBody)).digest('hex');
};

export const getCachedResponse = (requestHash: string) => {
  const row = db.prepare('SELECT response_json FROM RequestCache WHERE request_hash = ?').get(requestHash) as { response_json: string } | undefined;
  if (row) {
    try {
      return JSON.parse(row.response_json);
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
