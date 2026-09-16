import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

const META_API_URL = 'https://graph.facebook.com/v20.0';

export async function sendDirectMessage(
  recipientId: string,
  messageText: string
): Promise<{ success: boolean, error?: string }> {
  const isDryRun = process.env.DRY_RUN === 'true';

  const sqlite = new Database(dbPath);
  try {
    // 1. Validações pré-envio
    const lead = sqlite.prepare('SELECT channel_status FROM leads WHERE instagram_handle LIKE ?').get(`%${recipientId}%`) as { channel_status: string } | undefined;

    if (lead?.channel_status === 'do_not_contact') {
      throw new Error('LEAD_DO_NOT_CONTACT');
    }

    if (!lead || !['api_eligible', 'api_active'].includes(lead.channel_status)) {
      throw new Error(`CANAL_NAO_ELEGIVEL: ${lead?.channel_status || 'NOT_FOUND'}`);
    }

    // 2. Janela de 24h da Meta
    const lastInbound = sqlite.prepare(`
      SELECT sent_at FROM messages
      WHERE lead_id = (SELECT id FROM leads WHERE instagram_handle LIKE ?)
      AND direction = 'INBOUND'
      ORDER BY sent_at DESC LIMIT 1
    `).get(`%${recipientId}%`) as { sent_at: string } | undefined;

    if (lastInbound) {
      const lastDate = new Date(lastInbound.sent_at).getTime();
      const now = Date.now();
      const diffHours = (now - lastDate) / (1000 * 60 * 60);
      if (diffHours > 24) {
        sqlite.prepare(`UPDATE leads SET channel_status = 'api_window_closed' WHERE instagram_handle LIKE ?`).run(`%${recipientId}%`);
        throw new Error('API_WINDOW_CLOSED');
      }
    }

    // 3. Envio (Real ou Mock)
    if (isDryRun) {
      console.log(`📨 [META API MOCK] Sending message to ${recipientId}: "${messageText}"`);
      return { success: true };
    }

    const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
    if (!accountId || !token) throw new Error('INSTAGRAM_CREDENTIALS_MISSING');

    const response = await fetch(`${META_API_URL}/${accountId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: messageText },
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(`META_API_ERROR: ${JSON.stringify(result)}`);
    return { success: true };
  } catch (err: any) {
    console.error(`❌ [META API] Erro ao enviar:`, err.message);
    return { success: false, error: err.message };
  } finally {
    sqlite.close();
  }
}

export async function markMessageRead(messageId: string): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true';
  if (isDryRun) {
    console.log(`👀 [META API MOCK] Marking message ${messageId} as read.`);
    return;
  }
  // Implementação real omitida (requer IGSID)
}
