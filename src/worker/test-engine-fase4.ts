import Database from 'better-sqlite3';
import { processInboundMessage } from '@/features/conversations/engine';
import { sendDirectMessage } from '@/integrations/instagram';

const dbPath = 'data/sqlite.db';

async function runTestEngineFase4() {
  console.log('🧪 Iniciando Test Engine Fase 4...');
  const sqlite = new Database(dbPath);

  // 1. Limpa (Ordem importa)
  sqlite.exec('DELETE FROM messages; DELETE FROM leads; DELETE FROM jobs;');
  console.log('🧹 Tabelas limpas.');

  // 2. Prepara leads de teste (Simulando que já foram contatados pelo navegador)
  sqlite.prepare("INSERT INTO leads (instagram_handle, funnel_type, channel_status) VALUES (?, ?, 'browser_contact_sent')").run('@lead_1', 'A_CLIENT');
  sqlite.prepare("INSERT INTO leads (instagram_handle, funnel_type, channel_status) VALUES (?, ?, 'browser_contact_sent')").run('@lead_2', 'A_CLIENT');
  const lead1 = sqlite.prepare("SELECT id FROM leads WHERE instagram_handle = '@lead_1'").get() as any;
  const lead2 = sqlite.prepare("SELECT id FROM leads WHERE instagram_handle = '@lead_2'").get() as any;
  sqlite.close();

  // 3. Simula Webhook POST
  console.log('📨 [WEBHOOK] Simulando mensagens recebidas...');

  // Lead 1: Interesse
  const msg1 = { senderId: lead1.id, messageText: 'Tenho interesse, como funciona?', messageId: 'mid_123', timestamp: Date.now() };
  await processInboundMessage(JSON.stringify(msg1));

  // Lead 2: Opt-out
  const msg2 = { senderId: lead2.id, messageText: 'Pare de me mandar mensagem', messageId: 'mid_456', timestamp: Date.now() };
  await processInboundMessage(JSON.stringify(msg2));

  // 4. Validação
  const db = new Database(dbPath);
  const lead1Status = db.prepare("SELECT channel_status FROM leads WHERE id = ?").get(lead1.id) as any;
  const lead2Status = db.prepare("SELECT channel_status, pipeline_status FROM leads WHERE id = ?").get(lead2.id) as any;

  console.log('\n--- Validação Fase 4 ---');
  console.log(`Lead 1 (Interesse): Canal=${lead1Status.channel_status} (Esperado: api_active)`);
  console.log(`Lead 2 (Opt-out): Status=${lead2Status.pipeline_status}, Canal=${lead2Status.channel_status} (Esperado: closed, do_not_contact)`);

  db.close();
  console.log('\n✅ Testes da Fase 4 concluídos!');
}

runTestEngineFase4().catch(console.error);
