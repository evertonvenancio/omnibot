'use server';

import Database from 'better-sqlite3';
import { revalidatePath } from 'next/cache';

const dbPath = 'data/sqlite.db';

export async function toggleSystemPauseAction(): Promise<void> {
  const db = new Database(dbPath);
  const current = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
  const newVal = current?.value === 'true' ? 'false' : 'true';

  if (current) {
    db.prepare("UPDATE system_settings SET value = ? WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").run(newVal);
  } else {
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('SYSTEM_PAUSED_INSTAGRAM', ?)").run(newVal);
  }
  db.close();
  revalidatePath('/');
}

// New action for WhatsApp pause
export async function toggleWhatsAppPauseAction(): Promise<void> {
  const db = new Database(dbPath);
  const current = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
  const newVal = current?.value === 'true' ? 'false' : 'true';

  if (current) {
    db.prepare("UPDATE system_settings SET value = ? WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").run(newVal);
  } else {
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('SYSTEM_PAUSED_WHATSAPP', ?)").run(newVal);
  }
  db.close();
  revalidatePath('/');
}


export async function handleLeadAction(formData: FormData): Promise<void> {
  const leadId = formData.get('leadId') as string;
  const newStatus = formData.get('newStatus') as string;

  const db = new Database(dbPath);
  db.prepare("UPDATE leads SET channel_status = ? WHERE id = ?").run(newStatus, leadId);
  db.close();

  revalidatePath('/exceptions');
}

export async function retryJob(formData: FormData): Promise<void> {
  const jobId = formData.get('jobId') as string;

  const db = new Database(dbPath);
  db.prepare("UPDATE jobs SET status = 'pending', attempts = 0, error_message = NULL, run_at = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);
  db.close();

  revalidatePath('/exceptions');
}
