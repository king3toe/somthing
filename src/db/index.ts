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
      primary_model TEXT NOT NULL,
      fallback_model TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS CostTracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unified_key_id INTEGER,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cost_usd REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS SystemConfigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS MediaProviders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT UNIQUE NOT NULL,
      api_key TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ProviderKeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      is_active BOOLEAN DEFAULT 1,
      last_used DATETIME
    );

    CREATE TABLE IF NOT EXISTS RequestCache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_hash TEXT UNIQUE NOT NULL,
      response_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate existing ProviderConfigs to ProviderKeys if they exist and ProviderKeys is empty
  const keyCount = db.prepare('SELECT count(*) as c FROM ProviderKeys').get() as {c: number};
  if (keyCount.c === 0) {
    db.exec(`
      INSERT INTO ProviderKeys (provider_name, api_key, base_url)
      SELECT provider_name, api_key, base_url FROM ProviderConfigs;
    `);
  }

  // Seed some dummy usage data for the dashboard if empty
  const count = db.prepare('SELECT count(*) as c FROM CostTracking').get() as {c: number};
  if (count.c === 0) {
    db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens, cost_usd) VALUES (?, ?, ?, ?, ?)').run('openai', 'gpt-4o', 1200, 300, 0.015);
    db.prepare('INSERT INTO CostTracking (provider, model, prompt_tokens, completion_tokens, cost_usd) VALUES (?, ?, ?, ?, ?)').run('anthropic', 'claude-3-opus', 4000, 1500, 0.12);
  }

  console.log("Database initialized and tables created.");
};

export default db;
