import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

interface FunnelMetrics {
  discovered: number;
  dmsSent: number;
  replied: number;
  forwarded: number;
}

function computeWeeklyFunnel(sqlite: any, funnelType: string, cutoff: string, forwardedStatus: string): { metrics: FunnelMetrics, handles: string[] } {
  const discoveredRow = sqlite.prepare(
    `SELECT COUNT(*) as c FROM leads WHERE funnel_type = ? AND created_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const dmsRow = sqlite.prepare(
    `SELECT COUNT(*) as c FROM messages m JOIN leads l ON m.lead_id = l.id WHERE l.funnel_type = ? AND m.direction = 'OUTBOUND' AND m.sent_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const repliedRow = sqlite.prepare(
    `SELECT COUNT(DISTINCT l.id) as c FROM messages m JOIN leads l ON m.lead_id = l.id WHERE l.funnel_type = ? AND m.direction = 'INBOUND' AND m.sent_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const forwardedRows = sqlite.prepare(
    `SELECT instagram_handle FROM leads WHERE funnel_type = ? AND pipeline_status = ? AND updated_at >= ?`
  ).all(funnelType, forwardedStatus, cutoff) as { instagram_handle: string }[];

  return {
    metrics: {
      discovered: discoveredRow.c,
      dmsSent: dmsRow.c,
      replied: repliedRow.c,
      forwarded: forwardedRows.length
    },
    handles: forwardedRows.map(r => r.instagram_handle)
  };
}

export async function generateWeeklyReport(): Promise<string> {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const clientRes = computeWeeklyFunnel(sqlite, 'A_CLIENT', cutoff, 'forwarded_whatsapp');
    const partnerRes = computeWeeklyFunnel(sqlite, 'B_AFFILIATE', cutoff, 'forwarded_group');

    const costRow = sqlite.prepare(
      `SELECT COALESCE(SUM(CAST(estimated_cost_usd AS REAL)), 0) as total FROM ai_calls WHERE called_at >= ?`
    ).get(cutoff) as { total: number };

    const ownerRow = sqlite.prepare("SELECT value FROM system_settings WHERE key = 'OWNER_NAME'").get() as { value: string } | undefined;
    const ownerName = ownerRow ? ownerRow.value : 'Gestor';
    const totalCost = Number(costRow.total || 0).toFixed(2);

    const lines = [
      `*Nexus SDR*`,
      ``,
      `📊 *Relatório Semanal*`,
      `👤 *Gestor:* ${ownerName}`,
      ``,
      `💼 *Clientes Diretos*`,
      `🔍 Leads descobertos: ${clientRes.metrics.discovered}`,
      `✉️ DMs Enviadas: ${clientRes.metrics.dmsSent}`,
      `💬 Respostas: ${clientRes.metrics.replied}`,
      `🔗 Encaminhados WhatsApp: ${clientRes.metrics.forwarded}`,
      ``,
      `🤝 *Parceiros & Afiliados*`,
      `🔍 Leads descobertos: ${partnerRes.metrics.discovered}`,
      `✉️ DMs Enviadas: ${partnerRes.metrics.dmsSent}`,
      `💬 Respostas: ${partnerRes.metrics.replied}`,
      `🔗 Encaminhados Grupo: ${partnerRes.metrics.forwarded}`,
      ``,
      `💰 Custo de IA Total: $${totalCost}`
    ];

    return lines.join('\n');
  } finally {
    sqlite.close();
  }
}
