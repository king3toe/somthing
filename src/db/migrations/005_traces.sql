CREATE TABLE IF NOT EXISTS Traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  unified_key_id INTEGER,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  ttft_ms INTEGER,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,
  status_code INTEGER NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traces_request_id ON Traces(request_id);
CREATE INDEX IF NOT EXISTS idx_traces_created_at ON Traces(created_at);
