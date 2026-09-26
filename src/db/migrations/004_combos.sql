
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS __new_Combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  mode TEXT DEFAULT 'sequential', -- 'sequential' or 'parallel'
  stream_intermediates BOOLEAN DEFAULT 0,
  models_json TEXT NOT NULL -- string array of model_ids
);

-- Migrate old combos (assuming old primary/fallback translates to sequential array)
INSERT INTO __new_Combos (id, name, mode, stream_intermediates, models_json)
SELECT id, name, 'sequential', 0, '["' || primary_model || '", "' || fallback_model || '"]' FROM Combos;

DROP TABLE Combos;
ALTER TABLE __new_Combos RENAME TO Combos;
COMMIT;
PRAGMA foreign_keys=on;
