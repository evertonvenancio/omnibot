import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

// Garante que o diretório 'data' exista
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Singleton connection
const sqlite = new Database(dbPath);
// Ativa WAL mode para melhor performance e concorrência no SQLite
sqlite.pragma('journal_mode = WAL');

// Cria TODAS as tabelas do sistema se não existirem
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instagram_handle TEXT NOT NULL UNIQUE,
    source_post_url TEXT,
    full_name TEXT,
    bio TEXT,
    funnel_type TEXT NOT NULL,
    pipeline_status TEXT NOT NULL DEFAULT 'discovered',
    channel_status TEXT NOT NULL DEFAULT 'browser_contact_pending',
    followup_step INTEGER NOT NULL DEFAULT 0,
    score INTEGER DEFAULT 0,
    fit_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    converted INTEGER NOT NULL DEFAULT 0,
    conversion_quantity INTEGER NOT NULL DEFAULT 0
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
    estimated_cost_usd REAL NOT NULL,
    called_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    run_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS wa_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'draft',
    start_hour TEXT,
    end_hour TEXT,
    min_contacts INTEGER,
    max_contacts INTEGER,
    days_of_week TEXT,
    humanization_profile TEXT,
    ai_template TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS wa_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES wa_campaigns(id),
    phone TEXT NOT NULL,
    name TEXT,
    variables_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    fail_reason TEXT,
    sent_at TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export const db = drizzle(sqlite, { schema });

// Exporta o sqlite para uso direto quando necessário
export const sqliteInstance = sqlite;

// Função de Seed Automático (Regra de Ouro #1)
export function seedSystemSettings() {
  const settingsCount = db.select().from(schema.systemSettings).all().length;

  if (settingsCount === 0) {
    console.log('🌱 Inicializando o Banco de Dados com os dados do config/business.json...');
    const configPath = path.join(process.cwd(), 'config', 'business.json');

    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      for (const [key, value] of Object.entries(configData)) {
        db.insert(schema.systemSettings).values({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }).run();
      }
      console.log('✅ Banco populado com sucesso! A partir de agora, as configurações serão lidas do Banco.');
    }
  }
}
