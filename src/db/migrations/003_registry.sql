
CREATE TABLE IF NOT EXISTS ModelRegistry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  vision BOOLEAN DEFAULT 0,
  tools BOOLEAN DEFAULT 0,
  json_mode BOOLEAN DEFAULT 0,
  ctx_window INTEGER DEFAULT 8192,
  max_output INTEGER DEFAULT 4096,
  cost_input_1m REAL DEFAULT 0.0,
  cost_output_1m REAL DEFAULT 0.0,
  cost_cache_read_1m REAL DEFAULT 0.0,
  UNIQUE(model_id, provider)
);
