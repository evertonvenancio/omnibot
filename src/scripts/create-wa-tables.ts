import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/sqlite.db');
const db = new Database(dbPath);

db.exec(`
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
    FOREIGN KEY (campaign_id) REFERENCES wa_campaigns(id)
  );
`);

console.log('Tabelas wa_campaigns e wa_contacts verificadas/criadas com sucesso.');
db.close();