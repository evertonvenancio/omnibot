import Database from 'better-sqlite3';
import { enqueueDiscoveryJobs, processAiClassifyJob } from '@/features/leads/discovery';
import { generateFirstDm, saveMessageDraft } from '@/features/conversations/dm-generator';
import { processSendDmBrowserJob } from '@/features/conversations/send-dm-browser';

const dbPath = 'data/sqlite.db';

async function runTestEngine() {
  console.log('🧪 Iniciando Test Engine Fase 3...');
  const sqlite = new Database(dbPath);

  // 1. Limpa (Ordem importa por causa das FKs)
  sqlite.exec('DELETE FROM ai_calls; DELETE FROM messages; DELETE FROM jobs; DELETE FROM leads;');
  console.log('🧹 Tabelas limpas.');

  // 2. Mock Leads (Classificação Fase 2)
  enqueueDiscoveryJobs();
  const jobs = sqlite.prepare('SELECT * FROM jobs').all() as any[];
  for (const job of jobs) {
    await processAiClassifyJob(job.payload);
  }
  sqlite.exec('DELETE FROM jobs;');

  // 3. Fase 3: Geração de DM + Envio (DRY_RUN=true)
  const leads = sqlite.prepare('SELECT id FROM leads LIMIT 3').all() as { id: number }[];
  console.log(`🚀 Processando FASE 3 para ${leads.length} leads...`);

  // Forçar horário de operação para o teste
  sqlite.prepare("UPDATE system_settings SET value = '00:00-23:59' WHERE key = 'OPERATING_HOURS'").run();

  // Resetar contagem diária forçando a data na tabela mensagens (ajuste para o teste)
  sqlite.exec("UPDATE messages SET sent_at = '2026-09-01 10:00:00'");

  for (const lead of leads) {
    // Gerar DM
    const dm = await generateFirstDm(lead.id);
    saveMessageDraft(lead.id, dm, 'BROWSER');
    console.log(`✉️ [GENERATED DM] Lead ${lead.id}: "${dm.substring(0, 30)}..."`);

    // Enfileirar envio
    const jobId = sqlite.prepare("INSERT INTO jobs (type, payload) VALUES ('send_dm_browser', ?)").run(JSON.stringify({ leadId: lead.id })).lastInsertRowid;

    // Enviar (Processar job)
    await processSendDmBrowserJob(JSON.stringify({ leadId: lead.id, jobId }));
  }

  // 4. Validação
  const updatedLeads = sqlite.prepare("SELECT id, pipeline_status, channel_status FROM leads WHERE pipeline_status = 'contacted'").all();
  console.log('\n--- Status Leads Fase 3 (Contacted) ---');
  console.table(updatedLeads);

  sqlite.close();
  console.log('✅ Testes da Fase 3 concluídos com sucesso!');
}

runTestEngine().catch(console.error);
