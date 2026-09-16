import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

export function getSettings() {
  const sqlite = new Database(dbPath, { readonly: true });
  const rows = sqlite.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
  sqlite.close();

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function updateSetting(key: string, value: string) {
  const sqlite = new Database(dbPath);
  sqlite.prepare('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  sqlite.close();
}
