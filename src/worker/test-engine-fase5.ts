import Database from 'better-sqlite3';
import { ensureExperiment, selectVariantForLead, recordVariantResponse } from '@/features/experiments/index';

const dbPath = 'data/sqlite.db';

async function runTestEngineFase5() {
  console.log('🧪 Iniciando Test Engine Fase 5 — Experimentos A/B...');
  const sqlite = new Database(dbPath);

  // 1. Limpa experimentos antigos
  sqlite.exec('DELETE FROM experiments; DELETE FROM variants;');
  console.log('🧹 Experimentos anteriores limpos.');

  // 2. Cria um experimento
  ensureExperiment(
    'Abertura Funil A',
    'Olá! Vi que você trabalha com [NICHOS]. Podemos conversar sobre como otimizar sua pulverização com drones DJI?',
    'Fala! Notei seu interesse em [NICHOS]. A Tech & Agri trabalha com pulverização aérea de alta precisão. Vamos trocar uma ideia?'
  );

  // 3. Simula a geração de 20 leads e registra a variante atribuída
  console.log('\n🎯 Atribuindo variantes para 20 leads mockados...');
  const variantsCount: Record<number, number> = {};

  for (let i = 0; i < 20; i++) {
    const variant = selectVariantForLead('Abertura Funil A');
    if (variant) {
      variantsCount[variant.id] = (variantsCount[variant.id] || 0) + 1;
      console.log(`Lead #${i + 1} → Variante #${variant.id} (${variant.isControl ? 'CONTROLE' : 'TESTE'})`);
    }
  }

  // 4. Relatório de Distribuição
  console.log('\n--- Distribuição de Variantes ---');
  console.table(variantsCount);

  const totalAssigned = Object.values(variantsCount).reduce((a, b) => a + b, 0);
  console.log(`✅ Total de leads atribuídos: ${totalAssigned}/20`);

  // 5. Simula Respostas e Avaliação do Vencedor (Bate a taxa em mais de 50%)
  console.log('\n🧠 Simulando que a variante de TESTE performou muito melhor...');
  const variants = sqlite.prepare("SELECT * FROM variants").all() as any[];
  const control = variants.find((v: any) => v.is_control);
  const test = variants.find((v: any) => !v.is_control);

  if (control && test) {
    // Simula sample_size + response_count para o cálculo
    sqlite.prepare("UPDATE variants SET sample_size = ?, response_count = ? WHERE id = ?").run(20, 5, control.id);
    sqlite.prepare("UPDATE variants SET sample_size = ?, response_count = ? WHERE id = ?").run(20, 15, test.id); // 75% response rate!

    // Registra resposta para trigger
    recordVariantResponse(test.id);

    // Verifica se a vencedora foi marcada
    const updatedTest = sqlite.prepare("SELECT * FROM variants WHERE id = ?").get(test.id) as any;
    console.log(`\n🏆 Resultado: Variante #${test.id} (TESTE) declarada vencedora? ${updatedTest.is_winner ? '✅ SIM' : '❌ NÃO'}`);
  }

  sqlite.close();
  console.log('\n✅ Testes da Fase 5 concluídos com sucesso!');
}

runTestEngineFase5().catch(console.error);
