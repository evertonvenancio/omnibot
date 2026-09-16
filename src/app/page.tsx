import { sqliteInstance } from '@/db';
import DashboardTopBar from '@/components/DashboardTopBar';
import InfoCard from '@/components/InfoCard';
import PageContainer from '@/components/PageContainer';
import { STAGES_TRANSLATION } from '@/lib/leads-utils';
export const dynamic = 'force-dynamic';

interface PipelineCount {
  stage: string;
  count: number;
}

interface FunnelCounts {
  directs: PipelineCount[];
  affiliates: PipelineCount[];
}

interface DaySummary {
  day: string;
  totalContacts: number;
  sent: number;
  failed: number;
  pending: number;
  hasCampaign: boolean;
  status: 'Sem campanha' | 'Agendada' | 'Em Andamento' | 'Concluida';
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function loadDashboardData() {
  const db = sqliteInstance;
  try {
    // Instagram pause flag (renamed)
    const instagramRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
    const systemPausedInst = instagramRow?.value === 'true';
    // WhatsApp pause flag (new)
    const whatsappRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
    const systemPausedWhats = whatsappRow?.value === 'true';

    const totalCostRow = db
      .prepare('SELECT SUM(estimated_cost_usd) as total FROM ai_calls')
      .get() as { total: number | null };
    const totalCost = totalCostRow.total || 0;

    const totalLeads = (db.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number }).count;
    const activeCustomers = (db
      .prepare("SELECT COUNT(*) as count FROM leads WHERE pipeline_status = 'forwarded_whatsapp'")
      .get() as { count: number }).count;

    const directsRows = db
      .prepare("SELECT pipeline_status as stage, COUNT(*) as count FROM leads WHERE funnel_type = 'direct' GROUP BY pipeline_status")
      .all() as PipelineCount[];
    const affiliatesRows = db
      .prepare("SELECT pipeline_status as stage, COUNT(*) as count FROM leads WHERE funnel_type = 'affiliate' GROUP BY pipeline_status")
      .all() as PipelineCount[];

    // Total sales (conversion_quantity) where converted = true, summed across both funis
    const totalSalesRow = db.prepare("SELECT SUM(conversion_quantity) as total FROM leads WHERE converted = 'true'").get() as { total: number | null };
    const totalSales = totalSalesRow.total || 0;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekContacts = db
      .prepare(
        "SELECT id, status, COALESCE(sent_at, created_at) as ref_date FROM wa_contacts WHERE COALESCE(sent_at, created_at) >= ?"
      )
      .all(weekStart.toISOString()) as { id: number; status: string; ref_date: string }[];

    return {
      systemPausedInst,
      systemPausedWhats,
      totalCost,
      totalLeads,
      activeCustomers,
      funnels: { directs: directsRows, affiliates: affiliatesRows } as FunnelCounts,
      weekContacts,
      totalSales,
    };
  } finally {
    // Não feche a conexão - o Singleton gerencia isso
  }
}

function buildWeekSummary(weekContacts: { status: string; ref_date: string }[]): DaySummary[] {
  const byDay: Record<string, { total: number; sent: number; failed: number; pending: number }> = {};
  const dateByDay = new Map<string, Date>();

  for (const c of weekContacts) {
    const d = new Date(c.ref_date);
    if (isNaN(d.getTime())) continue;
    const jsDay = d.getDay();
    const ptDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const label = ptDays[jsDay];
    if (!byDay[label]) byDay[label] = { total: 0, sent: 0, failed: 0, pending: 0 };
    byDay[label].total++;
    if (c.status === 'sent') byDay[label].sent++;
    else if (c.status === 'failed') byDay[label].failed++;
    else byDay[label].pending++;
    dateByDay.set(label, d);
  }


  return WEEK_DAYS.map((day) => {
    const stats = byDay[day] || { total: 0, sent: 0, failed: 0, pending: 0 };
    const hasCampaign = stats.total > 0 || stats.pending > 0;

    let status: DaySummary['status'] = 'Sem campanha';
    if (hasCampaign) {
      if (stats.pending > 0 && stats.total > 0) status = 'Em Andamento';
      else if (stats.failed === 0 && stats.sent > 0) status = 'Concluida';
      else status = 'Agendada';
    }

    return {
      day,
      totalContacts: stats.total,
      sent: stats.sent,
      failed: stats.failed,
      pending: stats.pending,
      hasCampaign,
      status,
    };
  });
}

export default function DashboardPage() {
  const data = loadDashboardData();
  const systemPausedInst = data.systemPausedInst;
  const systemPausedWhats = data.systemPausedWhats;
  const totalSales = data.totalSales;
  const weekSummary = buildWeekSummary(data.weekContacts);
  // Removed per-channel campaign status lookup – not needed for dot rendering
  // const waCampaign = sqliteInstance
  //   .prepare('SELECT status FROM wa_campaigns ORDER BY id DESC LIMIT 1')
  //   .get() as { status: string } | undefined;
  // const whatsappPaused = waCampaign?.status === 'paused';

  // Instagram funnels
  const directsTotal = data.funnels.directs.reduce((s, r) => s + r.count, 0);
  const affiliatesTotal = data.funnels.affiliates.reduce((s, r) => s + r.count, 0);

  const funnelOrder: string[] = ['closed', 'qualified', 'contacted', 'responded', 'forwarded_whatsapp'];

  // WhatsApp sections
  const activeCampaign = weekSummary.find(d => d.hasCampaign && d.status === 'Em Andamento');
  const upcomingCampaigns = weekSummary.filter(d => d.hasCampaign && d.status === 'Agendada');
  const endedCampaigns = weekSummary.filter(d => d.hasCampaign && d.status === 'Concluida');

  return (
    <PageContainer scrollable>
        <DashboardTopBar />
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
          {/* Instagram block */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col gap-4 self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Instagram</h2>
              <span className={"w-3 h-3 rounded-full " + (systemPausedInst ? "bg-amber-500" : "bg-emerald-500")} title={systemPausedInst ? "Pausado" : "Ativo"} />
            </div>

            {/* Vendas totais block (Elastic) */}
            {totalSales > 0 && (
              <div className="bg-slate-800 rounded-lg p-4 text-center my-2">
                <div className="text-xs text-slate-400 mb-1">Vendas totais</div>
                <div className="text-2xl font-semibold text-white">{totalSales}</div>
              </div>
            )}

            {/* Funnel columns block (Elastic) */}
            {(directsTotal > 0 || affiliatesTotal > 0) && (
              <div className={`grid ${directsTotal > 0 && affiliatesTotal > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                {directsTotal > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Clientes diretos</h3>
                    <ul className="space-y-1">
                      {funnelOrder.map(stage => {
                        const count = data.funnels.directs.find(r => r.stage === stage)?.count ?? 0;
                        if (count === 0) return null;
                        const label = STAGES_TRANSLATION[stage] || stage;
                        return (
                          <li key={stage} className="flex justify-between items-center bg-slate-800/80 border border-slate-700/60 rounded-lg px-2 py-1.5">
                            <span className="text-slate-200 text-xs font-medium">{label}</span>
                            <span className="text-white font-bold text-xs">{count}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {affiliatesTotal > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Parceiros e afiliados</h3>
                    <ul className="space-y-1">
                      {funnelOrder.map(stage => {
                        const count = data.funnels.affiliates.find(r => r.stage === stage)?.count ?? 0;
                        if (count === 0) return null;
                        const label = STAGES_TRANSLATION[stage] || stage;
                        return (
                          <li key={stage} className="flex justify-between items-center bg-slate-800/80 border border-slate-700/60 rounded-lg px-2 py-1.5">
                            <span className="text-slate-200 text-xs font-medium">{label}</span>
                            <span className="text-white font-bold text-xs">{count}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* WhatsApp block */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col gap-4 self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">WhatsApp</h2>
              <span className={"w-3 h-3 rounded-full " + (systemPausedWhats ? "bg-amber-500" : "bg-emerald-500")} title={systemPausedWhats ? "Pausado" : "Ativo"} />
            </div>
            {activeCampaign && (
              <div className="bg-slate-800 p-4 rounded">
                <h3 className="text-base font-semibold text-white mb-2">{activeCampaign.day}</h3>
                <InfoCard title="Planejados" value={activeCampaign.totalContacts} label="" />
                <InfoCard title="Enviados" value={activeCampaign.sent} label="" />
                <InfoCard title="Falhas" value={activeCampaign.failed} label="" />
              </div>
            )}
            {upcomingCampaigns.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-white mt-4 mb-2">Próximas campanhas</h3>
                <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                  {upcomingCampaigns.map(c => (
                    <li key={c.day}>{c.day}: {c.totalContacts} planejados</li>
                  ))}
                </ul>
              </div>
            )}
            {endedCampaigns.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-white mt-4 mb-2">Campanhas encerradas</h3>
                <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                  {endedCampaigns.map(c => (
                    <li key={c.day}>{c.day}: enviados {c.sent}, falhas {c.failed}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
    </PageContainer>
  );
}
