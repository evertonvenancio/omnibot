import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = 'data/sqlite.db';
const configPath = 'config/business.json';

const sqlite = new Database(dbPath);

sqlite.exec(`
  DROP TABLE IF EXISTS wa_contacts;
  DROP TABLE IF EXISTS wa_campaigns;

  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instagram_handle TEXT NOT NULL UNIQUE,
    full_name TEXT,
    bio TEXT,
    funnel_type TEXT NOT NULL,
    pipeline_status TEXT NOT NULL DEFAULT 'discovered',
    channel_status TEXT NOT NULL DEFAULT 'browser_contact_pending',
    score INTEGER DEFAULT 0,
    fit_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    converted INTEGER DEFAULT 0,
    conversion_quantity INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    channel TEXT NOT NULL,
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    variant TEXT,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER REFERENCES leads(id),
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    estimated_cost_usd TEXT NOT NULL,
    called_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    run_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id),
    content TEXT NOT NULL,
    is_control INTEGER DEFAULT 0,
    is_winner INTEGER DEFAULT 0,
    response_count INTEGER DEFAULT 0,
    sample_size INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ai_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL,
    proposed_content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ Tabelas criadas com sucesso no SQLite!');

const count = sqlite.prepare('SELECT COUNT(*) as count FROM system_settings').get() as { count: number };
if (count.count === 0 && fs.existsSync(configPath)) {
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const insert = sqlite.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');

  const insertMany = sqlite.transaction((data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      insert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });

  insertMany(configData);
  console.log('🌱 Seed do business.json executado com sucesso!');
}

const settings = sqlite.prepare('SELECT key, value FROM system_settings').all();
console.log('\n--- Configurações Ativas no Banco ---');
console.table(settings);
