import Database from 'better-sqlite3';
import { db, seedSystemSettings } from '../db';
import { systemSettings } from '../db/schema';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

// Garante o Seed inicial
seedSystemSettings();

// RESET TOTAL DO BANCO (Exceto configurações)
console.log('🧹 Limpando tabelas de leads e histórico...');
const resetSqlite = new Database(dbPath);
resetSqlite.exec('DELETE FROM messages; DELETE FROM ai_calls; DELETE FROM jobs; DELETE FROM leads;');
resetSqlite.close();

// Lê todas as configurações para validar a Regra de Ouro #1
const allSettings = db.select().from(systemSettings).all();

console.log('--- Configurações Atuais no Banco (Regra #1) ---');
console.table(allSettings.map(s => ({ Chave: s.key, Valor: s.value.substring(0, 50) + '...' })));
console.log(`\nTotal de configurações carregadas do Banco: ${allSettings.length}`);

// Enfileira APENAS os 2 leads reais especificados
const sqlite = new Database(dbPath);
const insertJob = sqlite.prepare(`
  INSERT INTO jobs (type, payload, status, run_at)
  VALUES ('ai_classify', ?, 'pending', CURRENT_TIMESTAMP)
`);

const realLeads = [
  { instagramHandle: '_evenancio', fullName: 'Everton Venancio', bio: 'Produtor rural e testador de drones.' },
  { instagramHandle: 'vncduoff', fullName: 'Vinicius', bio: 'Agrônomo e piloto de drone.' }
];

for (const lead of realLeads) {
  insertJob.run(JSON.stringify({
    instagramHandle: lead.instagramHandle,
    fullName: lead.fullName,
    bio: lead.bio
  }));
}

console.log(`\n2 leads reais enfileirados (_evenancio, vncduoff). Aguarde o Worker processar.`);

// Adiciona job de relatório diário e semanal
sqlite.prepare(`
  INSERT INTO jobs (type, payload, status, run_at)
  VALUES ('daily_report', '{}', 'pending', CURRENT_TIMESTAMP)
`).run();
sqlite.prepare(`
  INSERT INTO jobs (type, payload, status, run_at)
  VALUES ('weekly_report', '{}', 'pending', CURRENT_TIMESTAMP)
`).run();
sqlite.close();
console.log('📅 Jobs de relatório diário e semanal enfileirados para teste imediato.');
