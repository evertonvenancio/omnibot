import Database from 'better-sqlite3';
import { revalidatePath } from 'next/cache';
import LeadsTopBar from '@/components/LeadsTopBar';
import PageContainer from '@/components/PageContainer';
import DateDisplay from '@/components/DateDisplay';
export const dynamic = 'force-dynamic';

const dbPath = 'data/sqlite.db';

function getExceptionData() {
  const db = new Database(dbPath, { readonly: true });
  const exceptionLeads = db.prepare("SELECT * FROM leads WHERE channel_status IN ('human_review_required', 'api_window_closed') OR pipeline_status = 'needs_human'").all() as any[];
  const deadJobs = db.prepare("SELECT * FROM jobs WHERE status = 'dead_letter' ORDER BY updated_at DESC").all() as any[];
  const pausedRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
  db.close();
  return { exceptionLeads, deadJobs, paused: pausedRow?.value === 'true' };
}

async function handleLeadAction(formData: FormData) {
  'use server';
  const leadId = formData.get('leadId') as string;
  const newStatus = formData.get('newStatus') as string;

  const db = new Database(dbPath);
  db.prepare("UPDATE leads SET channel_status = ? WHERE id = ?").run(newStatus, leadId);
  db.close();

  revalidatePath('/exceptions');
}

async function retryJob(formData: FormData) {
  'use server';
  const jobId = formData.get('jobId') as string;

  const db = new Database(dbPath);
  db.prepare("UPDATE jobs SET status = 'pending', attempts = 0, error_message = NULL, run_at = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);
  db.close();

  revalidatePath('/exceptions');
}

export default function ExceptionsPage() {
  const { exceptionLeads, deadJobs } = getExceptionData();

  return (
    <PageContainer scrollable>
      <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Exceções</h1>
        <a href="/leads" className="min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition">
          Voltar
        </a>
      </header>

      <div className="max-w-7xl mx-auto w-full">
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl mb-8">
          <h2 className="text-base font-semibold text-white mb-6 flex items-center justify-between">
            <span>Leads Precisando Atenção</span>
            <span className="text-xs px-2.5 py-1 bg-amber-950 text-amber-400 rounded-full border border-amber-500/30">{exceptionLeads.length} pendentes</span>
          </h2>


          {exceptionLeads.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-6 italic">Nenhuma exceção</div>
          ) : (
            <div className="space-y-3">
              {exceptionLeads.map((l: any) => (
                <div key={l.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <a href={`/leads/${l.id}`} className="text-white font-medium hover:underline">
                      {l.full_name || l.instagram_handle} <span className="text-xs text-slate-400">({l.instagram_handle})</span>
                    </a>
                    <p className="text-xs text-slate-400 mt-1">
                      <strong>Status atual:</strong> <span className="text-amber-400">{l.channel_status}</span>
                    </p>
                  </div>

                  <form action={handleLeadAction} className="flex gap-2">
                    <input type="hidden" name="leadId" value={l.id} />
                    <select name="newStatus" defaultValue="api_active" className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                      <option value="api_active">Reativar (API Ativa)</option>
                      <option value="browser_contact_sent">Mover p/ Navegador</option>
                      <option value="human_review_required">Manter Revisão</option>
                      <option value="closed">Encerrar Lead</option>
                      <option value="do_not_contact">Bloquear (Do Not Contact)</option>
                    </select>
                    <button type="submit" className="min-w-[100px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium transition">
                      Aplicar
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <h2 className="text-base font-semibold text-white mb-6 flex items-center justify-between">
            <span>Jobs Falhos (Dead Letter)</span>
            <span className="text-xs px-2.5 py-1 bg-rose-950 text-rose-400 rounded-full border border-rose-500/30">{deadJobs.length} travados</span>
          </h2>

          {deadJobs.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-6 italic">Nenhuma exceção</div>
          ) : (
            <div className="space-y-3">
              {deadJobs.map((j: any) => (
                <div key={j.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white text-sm">Job #{j.id} - {j.type}</span>
                      <span className="text-xs font-bold tracking-wider px-2 py-0.5 rounded-md bg-rose-950 text-rose-400 border border-rose-500/30">
                        Dead Letter
                      </span>
                    </div>
                    <p className="text-xs text-rose-300 font-mono mt-2 bg-rose-950/20 p-2 rounded">
                      Erro: {j.error_message || 'Desconhecido'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Tentativas: {j.attempts} | Última falha: <DateDisplay dateString={j.updated_at} /></p>
                  </div>

                  <form action={retryJob}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button type="submit" className="min-w-[100px] px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition">
                      Re-enfileirar
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
