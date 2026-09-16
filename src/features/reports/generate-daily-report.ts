import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

interface FunnelMetrics {
  discovered: number;
  dmsSent: number;
  replied: number;
  forwarded: number;
}

interface Metrics {
  client: FunnelMetrics;
  partner: FunnelMetrics;
  aiCost: number;
}

function computeFunnelMetrics(sqlite: InstanceType<typeof Database>, funnelType: string, cutoff: string, forwardedStatus: string): FunnelMetrics {
  const discoveredRow = sqlite.prepare(
    `SELECT COUNT(*) as c FROM leads WHERE funnel_type = ? AND created_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const dmsRow = sqlite.prepare(
    `SELECT COUNT(*) as c FROM messages m JOIN leads l ON m.lead_id = l.id WHERE l.funnel_type = ? AND m.direction = 'OUTBOUND' AND m.sent_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const repliedRow = sqlite.prepare(
    `SELECT COUNT(DISTINCT l.id) as c FROM messages m JOIN leads l ON m.lead_id = l.id WHERE l.funnel_type = ? AND m.direction = 'INBOUND' AND m.sent_at >= ?`
  ).get(funnelType, cutoff) as { c: number };

  const forwardedRow = sqlite.prepare(
    `SELECT COUNT(*) as c FROM leads WHERE funnel_type = ? AND pipeline_status = ? AND updated_at >= ?`
  ).get(funnelType, forwardedStatus, cutoff) as { c: number };

  return {
    discovered: discoveredRow.c,
    dmsSent: dmsRow.c,
    replied: repliedRow.c,
    forwarded: forwardedRow.c
  };
}

function computeMetrics(): Metrics {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const client = computeFunnelMetrics(sqlite, 'A_CLIENT', cutoff, 'forwarded_whatsapp');
    const partner = computeFunnelMetrics(sqlite, 'B_AFFILIATE', cutoff, 'forwarded_group');

    const costRow = sqlite.prepare(
      `SELECT COALESCE(SUM(CAST(estimated_cost_usd AS REAL)), 0) as total FROM ai_calls WHERE called_at >= ?`
    ).get(cutoff) as { total: number };

    return {
      client,
      partner,
      aiCost: Number(costRow.total || 0)
    };
  } finally {
    sqlite.close();
  }
}

export async function generateDailyReport(): Promise<string> {
  const sqlite = new Database(dbPath, { readonly: true });
  let ownerName = 'Operador';
  try {
    const ownerRow = sqlite.prepare("SELECT value FROM system_settings WHERE key = 'OWNER_NAME'").get() as { value: string } | undefined;
    if (ownerRow && ownerRow.value) {
      ownerName = ownerRow.value;
    }
  } catch (e) {
    // fallback
  } finally {
    sqlite.close();
  }

  const m = computeMetrics();
  const cost = Number(m.aiCost || 0).toFixed(2);
  return [
    '*OmniBot*',
    '',
    '📊 *Relatório Diário*',
    `👤 *Gestor:* ${ownerName}`,
    '',
    '💼 *Clientes Diretos*',
    `🔍 Leads descobertos: ${m.client.discovered}`,
    `✉️ DMs Enviadas: ${m.client.dmsSent}`,
    `💬 Respostas recebidas: ${m.client.replied}`,
    `🔗 Encaminhados Whatsapp: ${m.client.forwarded}`,
    '',
    '🤝 *Parceiros & Afiliados*',
    `🔍 Leads descobertos: ${m.partner.discovered}`,
    `✉️ DMs Enviadas: ${m.partner.dmsSent}`,
    `💬 Respostas recebidas: ${m.partner.replied}`,
    `🔗 Encaminhados Grupo: ${m.partner.forwarded}`,
    '',
    `💰 Custo de IA Total: $${cost}`
  ].join('\n');
}
