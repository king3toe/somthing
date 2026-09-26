import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../router.db');
const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');


import fs from 'fs';

export const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const runMigration = (version: number, file: string) => {
    const row = db.prepare('SELECT version FROM schema_version WHERE version = ?').get(version);
    if (!row) {
      console.log(`Running migration ${file}...`);
      const fsPath = require('path').resolve(__dirname, '../../src/db/migrations', file);
      const sql = fs.readFileSync(fsPath, 'utf8');
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
    }
  };

  runMigration(1, '001_init.sql');
  runMigration(2, '002_streaming_metrics.sql');
  runMigration(3, '003_registry.sql');
  runMigration(4, '004_combos.sql');

  const count = db.prepare('SELECT count(*) as c FROM schema_version').get() as {c: number};
  if (count.c > 0) {
      const toolCount = db.prepare('SELECT count(*) as c FROM ToolConfigs').get() as {c: number};
      if (toolCount.c === 0) {
         db.prepare('INSERT INTO ToolConfigs (tool_name, api_key, base_url) VALUES (?, ?, ?)').run('fetch_url', '', 'local');
      }
  }


  // Seed Registry
  const seedFile = require('path').resolve(__dirname, '../../src/registry/model-pricing.seed.json');
  if (fs.existsSync(seedFile)) {
     const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
     const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO ModelRegistry
        (model_id, provider, vision, tools, json_mode, ctx_window, max_output, cost_input_1m, cost_output_1m, cost_cache_read_1m)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     `);
     for (const m of seedData) {
        insertStmt.run(m.model_id, m.provider, m.vision ? 1 : 0, m.tools ? 1 : 0, m.json_mode ? 1 : 0, m.ctx_window, m.max_output, m.cost_input_1m, m.cost_output_1m, m.cost_cache_read_1m);
     }
  }

  console.log("Database initialized and migrated.");
};

export default db;


export const getProviderKeys = (): any[] => {
  return db.prepare('SELECT * FROM ProviderKeys WHERE is_active = 1').all();
};
