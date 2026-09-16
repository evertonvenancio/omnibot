'use server';
import Database from 'better-sqlite3';

import { revalidatePath } from 'next/cache';

export interface WaContactRow {
  id: number;
  name: string;
  phone: string;
  status: string;
  fail_reason: string | null;
  sent_at: string | null;
}

export async function toggleWhatsAppPauseAction(): Promise<void> {
  const db = new Database('data/sqlite.db');
  const current = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
  const newVal = current?.value === 'true' ? 'false' : 'true';

  if (current) {
    db.prepare("UPDATE system_settings SET value = ? WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").run(newVal);
  } else {
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('SYSTEM_PAUSED_WHATSAPP', ?)").run(newVal);
  }
  db.close();
  revalidatePath('/');
  revalidatePath('/whatsapp');
}

export async function getWaContactsAction(): Promise<WaContactRow[]> {
  try {
    const db = new Database('data/sqlite.db', { readonly: true });
    const rows = db
      .prepare(
        'SELECT id, name, phone, status, fail_reason, sent_at FROM wa_contacts ORDER BY id DESC LIMIT 50'
      )
      .all() as WaContactRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function createCampaign(formData: FormData): Promise<void> {
  // Reuso do código anterior que inseria a campanha sem iniciar envios
  const ai_template = formData.get('ai_template')?.toString() || '';
  const start_hour = formData.get('start_hour')?.toString() || '09:00';
  const end_hour = formData.get('end_hour')?.toString() || '18:00';
  const min_contacts = parseInt(formData.get('min_contacts')?.toString() || '1', 10);
  const max_contacts = parseInt(formData.get('max_contacts')?.toString() || '1', 10);
  const days = formData.getAll('days').map((d) => d.toString());
  const natural = parseInt(formData.get('human_natural')?.toString() || '60', 10);
  const moderated = parseInt(formData.get('human_moderated')?.toString() || '30', 10);
  const slow = parseInt(formData.get('human_slow')?.toString() || '10', 10);

  const db = new Database('data/sqlite.db');
  const stmt = db.prepare(
    `INSERT INTO wa_campaigns (status, days_of_week, start_hour, end_hour, ai_template, min_contacts, max_contacts, humanization_profile) VALUES ('saved', ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    JSON.stringify(days),
    start_hour,
    end_hour,
    ai_template,
    min_contacts,
    max_contacts,
    JSON.stringify({ natural, moderated, slow })
  );
  db.close();
}

export async function startCampaign(): Promise<void> {
  // Placeholder: atualiza status da última campanha salva para 'active'
  const db = new Database('data/sqlite.db');
  db.prepare(`UPDATE wa_campaigns SET status = 'active' WHERE status = 'saved' ORDER BY id DESC LIMIT 1`).run();
  db.close();
}

export async function cancelCampaign(): Promise<void> {
  // Delete the most recent campaign regardless of status and its associated contacts
  const db = new Database('data/sqlite.db');
  const latest = db.prepare(`SELECT id FROM wa_campaigns ORDER BY id DESC LIMIT 1`).get() as { id: number } | undefined;
  if (latest) {
    db.prepare(`DELETE FROM wa_campaigns WHERE id = ?`).run(latest.id);
    db.prepare(`DELETE FROM wa_contacts WHERE campaign_id = ?`).run(latest.id);
  }
  db.close();
}

export async function pauseResumeCampaign(): Promise<void> {
  // Toggle status between 'active' and 'paused' for the latest campaign
  const db = new Database('data/sqlite.db');
  const current = db.prepare(`SELECT id, status FROM wa_campaigns WHERE status IN ('active','paused') ORDER BY id DESC LIMIT 1`).get() as { id: number; status: string } | undefined;
  if (current) {
    const newStatus = current.status === 'active' ? 'paused' : 'active';
    db.prepare(`UPDATE wa_campaigns SET status = ? WHERE id = ?`).run(newStatus, current.id);
  }
  db.close();
}

export async function sendTestMessage(formData: FormData): Promise<string> {
  const phone = formData.get('test_phone')?.toString() || '';
  const template = formData.get('ai_template')?.toString() || '';
  // Simula geração de mensagem via IA (placeholder)
  const generated = `Mensagem de teste para ${phone} baseada no template: ${template}`;
  // Aqui enviaria via API WhatsApp; simulamos sucesso
  console.log('[WA] Test message sent:', generated);
  return generated;
}


export async function getCampaignStatus(): Promise<{status: string | null; exists: boolean; paused: boolean}> {
  const db = new Database('data/sqlite.db', { readonly: true });
  const row = db.prepare(`SELECT status FROM wa_campaigns ORDER BY id DESC LIMIT 1`).get() as { status: string } | undefined;
  const pausedRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
  db.close();
  const paused = pausedRow?.value === 'true';
  if (row) {
    return { status: row.status, exists: true, paused };
  }
  return { status: null, exists: false, paused };
}

export async function exportWaReportAction(_formData: FormData): Promise<void> {
  const db = new Database('data/sqlite.db', { readonly: true });
  const rows = db
    .prepare('SELECT name, phone, status, fail_reason, sent_at FROM wa_contacts')
    .all() as WaContactRow[];
  db.close();

  const csv =
    'Nome,Telefone,Status,Motivo_Falha,Data_Envio\n' +
    rows
      .map(
        (r) =>
          `${r.name},${r.phone},${r.status},${r.fail_reason || ''},${r.sent_at || ''}`
      )
      .join('\n');

  console.log('[WA] Relatório CSV:\n' + csv);
}
