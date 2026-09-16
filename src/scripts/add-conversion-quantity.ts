import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

const sqlite = new Database(dbPath);

try {
  console.log('🔄 [MIGRATION] Adicionando coluna conversion_quantity...');

  // Adiciona a coluna conversion_quantity
  sqlite.exec(`
    ALTER TABLE leads ADD COLUMN conversion_quantity INTEGER DEFAULT 0;
  `);

  console.log('✅ [MIGRATION] Coluna conversion_quantity adicionada com sucesso!');

  // Verifica se a coluna foi criada corretamente
  const tableInfo = sqlite.prepare('PRAGMA table_info(leads)').all();
  const hasColumn = tableInfo.some((col: any) => col.name === 'conversion_quantity');

  if (hasColumn) {
    console.log('🔍 [VALIDATION] Coluna conversion_quantity encontrada na tabela.');
  } else {
    console.error('❌ [VALIDATION] Coluna conversion_quantity não foi encontrada!');
  }
} catch (error) {
  console.error('❌ [MIGRATION] Erro ao adicionar coluna:', error);
} finally {
  sqlite.close();
}