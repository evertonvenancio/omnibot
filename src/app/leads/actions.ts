'use server';

import Database from 'better-sqlite3';
import { revalidatePath } from 'next/cache';

const dbPath = 'data/sqlite.db';

export async function updateLeadConversionAction(leadId: number, converted: boolean, quantity: number) {
  const db = new Database(dbPath);
  try {
    if (converted) {
      db.prepare("UPDATE leads SET converted = 1, conversion_quantity = ? WHERE id = ?").run(quantity, leadId);
    } else {
      db.prepare("UPDATE leads SET converted = 0, conversion_quantity = 0 WHERE id = ?").run(leadId);
    }
    revalidatePath('/leads');
    revalidatePath('/leads/direto/encaminhado');
    revalidatePath('/leads/afiliado/encaminhado');
  } finally {
    db.close();
  }
}
