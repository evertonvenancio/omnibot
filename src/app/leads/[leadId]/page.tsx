import Database from 'better-sqlite3';
import { updateLeadAction } from './actions';
export const dynamic = 'force-dynamic';

const dbPath = 'data/sqlite.db';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const db = new Database(dbPath, { readonly: true });
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(params.id) as any;
  const messages = db.prepare("SELECT * FROM messages WHERE lead_id = ? ORDER BY sent_at ASC").all(params.id) as any[];
  const aiCalls = db.prepare("SELECT * FROM ai_calls WHERE lead_id = ? ORDER BY called_at DESC").all(params.id) as any[];
  const settingsRows = db.prepare("SELECT key, value FROM system_settings").all() as any[];
  db.close();

  if (!lead) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-bold">Lead não encontrado</h1>
        <a href="/leads" className="text-emerald-400 underline mt-4 inline-block">Voltar ao CRM</a>
      </div>
    );
  }

  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  const cleanHandle = lead.instagram_handle.replace('@', '');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{lead.full_name || lead.instagram_handle}</h1>
            <p className="text-slate-400 mt-1">Detalhes do Lead e Timeline de Conversa</p>
          </div>
          <a href="/leads" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition">
            Voltar ao Kanban
          </a>
        </header>

        {/* Informações Principais e Ações */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl md:col-span-2">
            <h2 className="text-base font-semibold text-white mb-4">Informações do Perfil</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block">Instagram</span>
                <strong className="text-white">{lead.instagram_handle}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Funil</span>
                <strong className="text-white">{lead.funnel_type}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Score de Aderência</span>
                <strong className="text-emerald-400">{lead.score} / 100</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Status do Canal</span>
                <strong className="text-cyan-400">{lead.channel_status}</strong>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-slate-500 text-sm block mb-1">Bio do Instagram</span>
              <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 text-sm">{lead.bio || 'Sem bio informada'}</p>
            </div>
            <div className="mt-4">
              <span className="text-slate-500 text-sm block mb-1">Justificativa do Fit</span>
              <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 text-sm">{lead.fit_reason || 'N/A'}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Atalhos Externos</h2>
              <p className="text-xs text-slate-400 mb-6">Acesse rapidamente as plataformas oficiais para intervenção humana.</p>
            </div>
            <div className="space-y-3">
              <a href={`https://instagram.com/${cleanHandle}`} target="_blank" rel="noopener noreferrer" className="block text-center w-full py-2.5 bg-pink-950/60 hover:bg-pink-900/60 text-pink-300 border border-pink-500/30 rounded-xl font-medium transition text-sm">
                📸 Abrir no Instagram
              </a>
              <a href={settings.WHATSAPP_LINK || '#'} target="_blank" rel="noopener noreferrer" className="block text-center w-full py-2.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 rounded-xl font-medium transition text-sm">
                💬 Ir para WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Manual Controls */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-8">
          <h2 className="text-xl font-semibold text-white mb-6">Controles Manuais</h2>
          <form action={updateLeadAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="hidden" name="leadId" value={lead.id} />
            <label className="flex flex-col">
              <span className="text-slate-400 mb-1">Status do Pipeline</span>
              <select name="pipelineStatus" defaultValue={lead.pipeline_status} className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-100">
                <option value="discovered">Discovered</option>
                <option value="qualified">Qualified</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="forwarded_whatsapp">Forwarded WhatsApp</option>
                <option value="forwarded_group">Forwarded Group</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-slate-400 mb-1">Status do Canal</span>
              <select name="channelStatus" defaultValue={lead.channel_status} className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-100">
                <option value="browser_contact_pending">Browser Contact Pending</option>
                <option value="browser_contact_sent">Browser Contact Sent</option>
                <option value="waiting_inbound_reply">Waiting Inbound Reply</option>
                <option value="api_eligible">API Eligible</option>
                <option value="api_active">API Active</option>
                <option value="completed">Completed</option>
                <option value="human_review_required">Human Review Required</option>
                <option value="do_not_contact">Do Not Contact</option>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-slate-400 mb-1">Score</span>
              <input type="number" name="score" defaultValue={lead.score ?? ''} className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-100" />
            </label>
            <label className="flex flex-col">
              <span className="text-slate-400 mb-1">Converted</span>
              <select name="converted" defaultValue={lead.converted ? 'true' : 'false'} className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-100">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-slate-400 mb-1">Sales Generated</span>
              <input type="number" name="salesGenerated" defaultValue={lead.sales_generated ?? ''} className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-100" />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium">
                Atualizar Lead
              </button>
            </div>
          </form>
        </section>
        {/* Timeline de Mensagens */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-8">
          <h2 className="text-xl font-semibold text-white mb-6">Timeline de Conversas</h2>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Nenhuma mensagem registrada com este lead.</p>
            ) : (
              messages.map((m: any) => (
                <div key={m.id} className={`p-4 rounded-xl border ${m.direction === 'OUTBOUND' ? 'bg-slate-950 border-emerald-500/30 ml-8' : 'bg-slate-950 border-slate-800 mr-8'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-xs font-bold ${m.direction === 'OUTBOUND' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                      {m.direction === 'OUTBOUND' ? '📤 Robô / Sistema' : '📥 Lead (Inbound)'} ({m.channel})
                    </span>
                    <span className="text-[10px] text-slate-500">{m.sent_at}</span>
                  </div>
                  <p className="text-sm text-slate-200 mt-2">{m.content}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Log de Decisões da IA */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-white mb-6">Log de Custos e Chamadas de IA</h2>
          <div className="space-y-3">
            {aiCalls.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Nenhuma chamada de IA registrada para este lead.</p>
            ) : (
              aiCalls.map((c: any) => (
                <div key={c.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                  <div>
                    <strong className="text-white">{c.model}</strong> — Tokens: {c.prompt_tokens} prompt / {c.completion_tokens} comp.
                    <span className="text-slate-500 block mt-0.5">{c.called_at}</span>
                  </div>
                  <span className="text-emerald-400 font-bold">${c.estimated_cost_usd}</span>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
