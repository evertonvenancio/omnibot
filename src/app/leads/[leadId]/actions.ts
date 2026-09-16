'use server';

import Database from 'better-sqlite3';
import { revalidatePath } from 'next/cache';

const dbPath = 'data/sqlite.db';

export async function updateLeadAction(formData: FormData) {
  const leadId = Number(formData.get('leadId'));
  const pipelineStatus = (formData.get('pipelineStatus') as string) ?? null;
  const channelStatus = (formData.get('channelStatus') as string) ?? null;
  const scoreStr = formData.get('score') as string;
  const score = scoreStr !== undefined && scoreStr !== '' ? Number(scoreStr) : null;
  const convertedStr = formData.get('converted') as string;
  const converted = convertedStr === 'true' ? 1 : convertedStr === 'false' ? 0 : null;
  const salesStr = formData.get('salesGenerated') as string;
  const salesGenerated = salesStr !== undefined && salesStr !== '' ? Number(salesStr) : null;

  const db = new Database(dbPath);
  db.prepare(`
    UPDATE leads SET
      pipeline_status = COALESCE(?, pipeline_status),
      channel_status = COALESCE(?, channel_status),
      score = COALESCE(?, score),
      converted = COALESCE(?, converted),
      sales_generated = COALESCE(?, sales_generated),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(pipelineStatus, channelStatus, score, converted, salesGenerated, leadId);
  db.close();

  // Revalidate the lead detail page to reflect changes
  revalidatePath(`/leads/${leadId}`);
}
