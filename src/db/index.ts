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
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instagram_handle TEXT,
    bio TEXT,
    pipeline_status TEXT,
    channel_status TEXT,
    funnel_type TEXT,
    score INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    converted INTEGER DEFAULT 0,
    conversion_quantity INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    direction TEXT,
    content TEXT,
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
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
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    run_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS wa_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT,
    days_of_week TEXT,
    start_hour TEXT,
    end_hour TEXT,
    ai_template TEXT,
    min_contacts INTEGER,
    max_contacts INTEGER,
    humanization_profile TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS wa_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    name TEXT,
    phone TEXT,
    status TEXT,
    fail_reason TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES wa_campaigns(id)
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
