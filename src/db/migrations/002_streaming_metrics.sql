
-- Add ttft_ms if it doesn't exist
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS __new_ProviderKeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT,
  is_active BOOLEAN DEFAULT 1,
  last_used DATETIME,
  error_count INTEGER DEFAULT 0,
  rate_limit_until DATETIME,
  avg_latency_ms INTEGER DEFAULT 0,
  ttft_ms INTEGER DEFAULT 0,
  weight INTEGER DEFAULT 1
);
INSERT INTO __new_ProviderKeys (id, provider_name, api_key, base_url, is_active, last_used, error_count, rate_limit_until, avg_latency_ms, weight)
SELECT id, provider_name, api_key, base_url, is_active, last_used, error_count, rate_limit_until, avg_latency_ms, weight FROM ProviderKeys;
DROP TABLE ProviderKeys;
ALTER TABLE __new_ProviderKeys RENAME TO ProviderKeys;
COMMIT;
PRAGMA foreign_keys=on;
