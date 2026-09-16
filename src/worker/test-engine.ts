import Database from 'better-sqlite3';
import { enqueueDiscoveryJobs, processAiClassifyJob } from '@/features/leads/discovery';

const dbPath = 'data/sqlite.db';

async function runTestEngine() {
  console.log('🧪 Iniciando Test Engine...');
  const sqlite = new Database(dbPath);

  // 1. Limpa
  sqlite.exec('DELETE FROM jobs; DELETE FROM leads; DELETE FROM ai_calls;');
  console.log('🧹 Tabelas limpas.');

  // 2. Mock Leads
  enqueueDiscoveryJobs();

  // 3. Processamento
  console.log('🚀 Processando Jobs mockados...');
  const jobs = sqlite.prepare('SELECT * FROM jobs').all() as any[];

  const { processAiClassifyJob } = await import('@/features/leads/discovery');

  for (const job of jobs) {
    await processAiClassifyJob(job.payload);
  }

  // 4. Validação
  const leads = sqlite.prepare('SELECT * FROM leads').all() as any[];
  console.log('\n--- Leads Classificados ---');
  console.table(leads);

  const aiCalls = sqlite.prepare('SELECT * FROM ai_calls').all() as any[];
  console.log('\n--- AI Calls (Custos) ---');
  console.table(aiCalls);

  // 5. Teste de Orçamento
  console.log('\n🧪 Testando bloqueio de orçamento...');
  sqlite.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run("0.00", "OPENAI_MONTHLY_BUDGET_USD");

  try {
    await processAiClassifyJob(JSON.stringify({ instagramHandle: '@test', fullName: 'Test', bio: '...' }));
  } catch (e: any) {
    console.log('✅ Bloqueio de orçamento funcionou:', e.message);
  }

  sqlite.close();
}

runTestEngine().catch(console.error);
