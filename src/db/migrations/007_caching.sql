CREATE TABLE IF NOT EXISTS RequestCache (
  request_hash TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_req_cache_created ON RequestCache(created_at);
