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

  const count = db.prepare('SELECT count(*) as c FROM schema_version').get() as {c: number};
  if (count.c > 0) {
      const toolCount = db.prepare('SELECT count(*) as c FROM ToolConfigs').get() as {c: number};
      if (toolCount.c === 0) {
         db.prepare('INSERT INTO ToolConfigs (tool_name, api_key, base_url) VALUES (?, ?, ?)').run('fetch_url', '', 'local');
      }
  }

  console.log("Database initialized and migrated.");
};

export default db;


export const getProviderKeys = (): any[] => {
  return db.prepare('SELECT * FROM ProviderKeys WHERE is_active = 1').all();
};
