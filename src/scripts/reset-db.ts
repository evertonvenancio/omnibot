import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

export function resetDatabase() {
  console.log('🧹 [RESET] Iniciando limpeza total do banco de dados (respeitando system_settings)...');
  const sqlite = new Database(dbPath);

  try {
    sqlite.exec('BEGIN TRANSACTION;');

    // Remove dados das tabelas operacionais, mantendo system_settings
    sqlite.exec('DELETE FROM ai_calls;');
    sqlite.exec('DELETE FROM messages;');
    sqlite.exec('DELETE FROM jobs;');
    sqlite.exec('DELETE FROM variants;');
    sqlite.exec('DELETE FROM ai_proposals;');
    sqlite.exec('DELETE FROM experiments;');
    sqlite.exec('DELETE FROM leads;');

    sqlite.exec('COMMIT;');
    console.log('✅ [RESET] Banco limpo com sucesso! Apenas system_settings foi preservado.');
  } catch (error) {
    sqlite.exec('ROLLBACK;');
    console.error('❌ [RESET] Erro ao limpar o banco de dados:', error);
    throw error;
  } finally {
    sqlite.close();
  }
}

// Se executado diretamente via CLI
if (require.main === module) {
  resetDatabase();
}
