
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS __new_UnifiedKeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  spend_limit_usd REAL DEFAULT 10.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO __new_UnifiedKeys (id, key, name, created_at)
SELECT id, key, name, created_at FROM UnifiedKeys;

DROP TABLE UnifiedKeys;
ALTER TABLE __new_UnifiedKeys RENAME TO UnifiedKeys;

COMMIT;
PRAGMA foreign_keys=on;
