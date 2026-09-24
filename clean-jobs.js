const db = require('better-sqlite3')('data/sqlite.db'); db.exec('DELETE FROM jobs;'); console.log('Todos os jobs foram removidos da fila.');
