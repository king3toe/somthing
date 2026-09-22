import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../router.db');
const db = new Database(dbPath, { verbose: console.log });

export const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS UnifiedKeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ProviderConfigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT UNIQUE NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT
    );

    CREATE TABLE IF NOT EXISTS ToolConfigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT UNIQUE NOT NULL,
      api_key TEXT,
      base_url TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      rules_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS CostTracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unified_key_id INTEGER,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cost_usd REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unified_key_id) REFERENCES UnifiedKeys(id)
    );

    CREATE TABLE IF NOT EXISTS Memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Database initialized and tables created (if they didn't exist).");
};

export default db;
