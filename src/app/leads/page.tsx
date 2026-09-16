import Database from 'better-sqlite3';
import LeadsTopBar from '@/components/LeadsTopBar';
import PageContainer from '@/components/PageContainer';
import { translateStatus } from '@/lib/leads-utils';

export const dynamic = 'force-dynamic';

const dbPath = 'data/sqlite.db';

type CounterBoxProps = {
  title: string;
  count: number;
  href: string;
};

function CounterBox({ title, count, href }: CounterBoxProps) {
  return (
    <a href={href} className="block bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl text-center hover:bg-slate-800 transition">
      <div className="text-xs text-slate-400 mb-0.5">{title}</div>
      <div className="text-xl font-bold text-white">{count}</div>
    </a>
  );
}

export default function LeadsPage() {
  const db = new Database(dbPath, { readonly: true });

  try {
    const pausedRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
    const paused = pausedRow?.value === 'true';

    const clientesDiretosCount = (db.prepare(`
      SELECT COALESCE(SUM(conversion_quantity), 0) as sum
      FROM leads
      WHERE funnel_type = 'A_CLIENT'
      AND pipeline_status = 'forwarded_whatsapp'
      AND converted = 1
    `).get() as any).sum;

    const parceirosAfiliadosCount = (db.prepare(`
      SELECT COALESCE(SUM(conversion_quantity), 0) as sum
      FROM leads
      WHERE funnel_type = 'B_AFFILIATE'
      AND pipeline_status = 'forwarded_group'
      AND converted = 1
    `).get() as any).sum;

    const descobertoCount = (db.prepare(`SELECT COUNT(*) as cnt FROM leads`).get() as any).cnt;
    const rejeitadosCount = (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'REJECTED'`).get() as any).cnt;

    const clientesDiretosStages = [
      { name: 'qualified', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'qualified'`).get() as any).cnt, status: 'qualified' },
      { name: 'closed', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'closed'`).get() as any).cnt, status: 'closed' },
      { name: 'contacted', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'contacted'`).get() as any).cnt, status: 'contacted' },
      { name: 'responded', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'contacted' AND channel_status = 'api_active'`).get() as any).cnt, status: 'responded' },
      { name: 'interested', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'interested'`).get() as any).cnt, status: 'interested' },
      { name: 'forwarded_whatsapp', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'A_CLIENT' AND pipeline_status = 'forwarded_whatsapp'`).get() as any).cnt, status: 'encaminhado' },
    ];

    const parceirosAfiliadosStages = [
      { name: 'qualified', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'qualified'`).get() as any).cnt, status: 'qualified' },
      { name: 'closed', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'closed'`).get() as any).cnt, status: 'closed' },
      { name: 'contacted', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'contacted'`).get() as any).cnt, status: 'contacted' },
      { name: 'responded', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'contacted' AND channel_status = 'api_active'`).get() as any).cnt, status: 'responded' },
      { name: 'interested', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'interested'`).get() as any).cnt, status: 'interested' },
      { name: 'forwarded_group', count: (db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE funnel_type = 'B_AFFILIATE' AND pipeline_status = 'forwarded_group'`).get() as any).cnt, status: 'encaminhado' },
    ];

    return (
      <PageContainer>
        <div className="w-full">
          <LeadsTopBar paused={paused} />
        </div>

        <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between overflow-hidden">
          {/* BLOCO 1 — 4 caixas no topo */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <CounterBox title="Clientes diretos" count={clientesDiretosCount} href="/leads/direto/vendas" />
            <CounterBox title="Parceiros e afiliados" count={parceirosAfiliadosCount} href="/leads/afiliado/vendas" />
            <CounterBox title="Descoberto" count={descobertoCount} href="/leads/descoberto" />
            <CounterBox title="Rejeitados" count={rejeitadosCount} href="/leads/rejeitados" />
          </div>

          {/* LADO A LADO: Clientes diretos | Parceiros e afiliados */}
          <div className="grid grid-cols-2 gap-6 flex-1">
            {/* Seção Clientes diretos */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
              <h2 className="text-base font-semibold text-white mb-2">Clientes diretos</h2>
              <div className="space-y-1.5 flex-1 flex flex-col justify-around">
                {clientesDiretosStages.map((stage) => (
                  <a
                    key={stage.name}
                    href={`/leads/direto/${stage.status}`}
                    className="flex justify-between items-center bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 hover:bg-slate-700/80 transition"
                  >
                    <span className="text-slate-200 text-sm font-medium">{translateStatus(stage.name)}</span>
                    <span className="text-white font-bold text-sm">{stage.count}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Seção Parceiros e afiliados */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
              <h2 className="text-base font-semibold text-white mb-2">Parceiros e afiliados</h2>
              <div className="space-y-1.5 flex-1 flex flex-col justify-around">
                {parceirosAfiliadosStages.map((stage) => (
                  <a
                    key={stage.name}
                    href={`/leads/afiliado/${stage.status}`}
                    className="flex justify-between items-center bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 hover:bg-slate-700/80 transition"
                  >
                    <span className="text-slate-200 text-sm font-medium">{translateStatus(stage.name)}</span>
                    <span className="text-white font-bold text-sm">{stage.count}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  } finally {
    db.close();
  }
}
