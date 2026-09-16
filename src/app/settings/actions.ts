'use server';

import Database from 'better-sqlite3';
import { revalidatePath } from 'next/cache';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

export async function saveSettingsAction(formData: FormData): Promise<void> {
  try {
    const keys = [
      'OWNER_NAME', 'OWNER_ROLE', 'COMPANY_NAME', 'COMPANY_WEBSITE',
      'INSTAGRAM_HANDLE', 'WHATSAPP_LINK', 'AFFILIATE_GROUP_LINK',
      'ONE_LINE_PITCH', 'HOW_IT_WORKS', 'REVENUE_MODEL', 'MARKET_JARGON',
      'VERIFIED_CLAIMS', 'UNVERIFIED_CLAIMS', 'ICP_SEGMENTS', 'ICP_KEYWORDS',
      'GEOGRAPHY', 'AFFILIATE_TOPICS', 'MAX_DMS_PER_DAY', 'OPERATING_HOURS',
      'OPERATING_TIMEZONE', 'OPERATING_DAYS'
    ];

    const updates: Array<{ key: string; value: string }> = [];
    for (const key of keys) {
      if (key === 'OPERATING_DAYS') {
        const days = formData.getAll('OPERATING_DAYS');
        updates.push({ key, value: days.join(',') });
      } else {
        const value = formData.get(key);
        updates.push({ key, value: typeof value === 'string' ? value : '' });
      }
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');

    try {
      const upsert = sqlite.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);

      const transaction = sqlite.transaction((rows: Array<{ key: string; value: string }>) => {
        for (const row of rows) {
          upsert.run(row.key, row.value);
        }
      });

      transaction(updates);
    } finally {
      sqlite.close();
    }

    revalidatePath('/settings');
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
  }
}
