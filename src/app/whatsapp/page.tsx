'use client';
import { useState, useEffect } from 'react';
import { createCampaign, startCampaign, toggleWhatsAppPauseAction, cancelCampaign, sendTestMessage, getCampaignStatus } from './actions';
import PageContainer from '@/components/PageContainer';

export default function WhatsAppPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [paused, setPaused] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  // Removed unused testResult state
  // const [testResult, setTestResult] = useState('');
  const [humanization, setHumanization] = useState({ natural: 60, moderated: 30, slow: 10 });
  const [log, setLog] = useState<string[]>([]);

  // Load campaign status on mount and after actions (revalidation)
  useEffect(() => {
    (async () => {
      const { status: dbStatus, exists: dbExists, paused: dbPaused } = await getCampaignStatus();
      setStatus(dbStatus);
      setExists(dbExists);
      setPaused(dbPaused);
    })();
  }, []);

  // Update humanization percentages to always sum 100
  const updateProfile = (profile: 'natural' | 'moderated' | 'slow', value: number) => {
    const other = ['natural', 'moderated', 'slow'].filter(p => p !== profile) as Array<'natural' | 'moderated' | 'slow'>;
    const remaining = 100 - value;
    const sumOther = humanization[other[0]] + humanization[other[1]];
    const newOther1 = Math.round((humanization[other[0]] / sumOther) * remaining);
    const newOther2 = remaining - newOther1;
    setHumanization({
      ...humanization,
      [profile]: value,
      [other[0]]: newOther1,
      [other[1]]: newOther2,
    });
  };

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) {
      console.warn('Por favor, preencha o número de telefone.');
      return;
    }
    try {
      const result = await sendTestMessage(new FormData(document.getElementById('test-form') as HTMLFormElement));
      console.log('Teste de mensagem enviado:', result);
    } catch (error: any) {
      alert('Erro ao montar teste: ' + error.message);
      console.error('Erro ao testar envio:', error);
    }
  };

  // Simulated log while campaign is active
  useEffect(() => {
    if (status === 'active') {
      const interval = setInterval(() => {
        setLog(prev => [...prev, `Log ${new Date().toLocaleTimeString()}: enviando...`]);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const topBtn = "min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition";
  // Removed unused btnBase reference
  // const btnBase = "..."; // no longer needed
  const labelClass = "text-sm font-medium text-slate-400 mb-1 block";
  const inputClass = "w-full h-10 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600";
  const textareaClass = `${inputClass} h-16 resize-none`;
  // Day button base style
  const baseDayBtn = "w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium";
  // Day button class function per spec
  const dayBtnClass = (selected: boolean) => selected ? "bg-slate-500 border border-slate-400 text-white" : "bg-slate-800 border border-slate-700 text-slate-300";
  const [fileName, setFileName] = useState<string>('');
  // Status class for pause/resume button (literal strings)
  const statusClass = paused ? "text-amber-500 font-semibold" : "text-emerald-500 font-semibold";

  return (
    <PageContainer>
      <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">WhatsApp</h1>
        <div className="flex items-center gap-2">
          <a href="/" className={topBtn}>Voltar</a>
          <form action={startCampaign} className="inline">
            <button type="submit" disabled={!exists || status === 'active'} className={topBtn}>Iniciar</button>
          </form>
          <form action={cancelCampaign} className="inline">
            <button type="submit" disabled={!exists} className={topBtn}>Cancelar</button>
          </form>
          <form action={async () => {
            await toggleWhatsAppPauseAction();
            setPaused(prev => !prev);
          }} className="inline">
            <button
              type="submit"
              className={`min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 ${statusClass} rounded-lg font-medium transition`}
            >
              {paused ? 'Retomar' : 'Pausar'}
            </button>
          </form>
        </div>
      </header>

      {/* Single Card containing all configuration, fits viewport */}
      <form id="test-form" action={createCampaign} className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-8 flex flex-col gap-6 overflow-hidden">
        <div className="grid grid-cols-3 gap-8">
          {/* Column 1 */}
          <div className="flex flex-col gap-6">
            {/* Upload de contatos */}
            <div>
              <label className={labelClass}>Upload de contatos</label>
              <label className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 cursor-pointer hover:bg-slate-700 w-fit">
                Escolher arquivo
                <input type="file" name="base" accept=".csv,.xlsx" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setFileName(file.name);
                }} />
              </label>
              <span className="text-xs text-slate-400 ml-2">{fileName || 'Nenhum arquivo escolhido'}</span>
            </div>
            {/* Hora início */}
            <div>
              <label className={labelClass}>Hora início</label>
              <input type="time" name="start_hour" className={inputClass} />
            </div>
            {/* Hora fim */}
            <div>
              <label className={labelClass}>Hora fim</label>
              <input type="time" name="end_hour" className={inputClass} />
            </div>
            {/* Mín. / Máx. */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Mín.</label>
                <input type="number" name="min_contacts" min="1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Máx.</label>
                <input type="number" name="max_contacts" min="1" className={inputClass} />
              </div>
            </div>
          </div>
          {/* Column 2 */}
          <div className="flex flex-col gap-6">
            {/* Dias da campanha */}
            <div>
              <label className={labelClass}>Dias da campanha</label>
              <div className="flex justify-between gap-1.5">
                {['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map((full, idx) => {
                  const abbrev = full.charAt(0);
                  const dayKey = ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'][idx];
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      title={full}
                      onClick={() => toggleDay(dayKey)}
                      className={`${baseDayBtn} ${dayBtnClass(selectedDays.includes(dayKey))}`}
                    >{abbrev}</button>
                  );
                })}
              </div>
            </div>
            {/* Divider */}
            <div className="h-px bg-slate-800" />
            {/* Humanização */}
            <div>
              <label className={labelClass}>Humanização</label>
              <div className="flex flex-col gap-4">
                {(['natural','moderated','slow'] as const).map(profile => (
                  <div key={profile}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 capitalize">{profile === 'moderated' ? 'Moderação' : profile === 'slow' ? 'Devagar' : 'Natural'}</span>
                      <span className="text-sm font-medium text-slate-200">{humanization[profile]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={humanization[profile]}
                      onChange={e => updateProfile(profile, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Divider */}
            <div className="h-px bg-slate-800" />
            {/* Testar envio */}
            <div>
              <label className={labelClass}>Testar envio</label>
              <div className="flex gap-2 items-center">
                <input
                  type="tel"
                  placeholder="Número (ex: +5511999999999)"
                  className={inputClass + " flex-1"}
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                />
                <button type="button" onClick={handleTestSend} className={topBtn}>Enviar</button>
              </div>
            </div>
          </div>
          {/* Column 3 */}
          <div className="flex flex-col gap-6 h-full">
            {/* Template da mensagem */}
            <div className="flex flex-col flex-1">
              <label className={labelClass}>Template da mensagem</label>
              <textarea name="ai_template" rows={2} className={textareaClass + " flex-1"} />
            </div>
            {/* Botões */}
            <div className="flex flex-col gap-2">
              <button type="submit" className={topBtn}>Criar campanha</button>
              <button type="button" className={topBtn} onClick={() => {/* placeholder for export action */}} >Exportar Relatório (CSV)</button>
            </div>
          </div>
        </div>
        {/* Hidden inputs for days and humanization */}
        {selectedDays.map(day => (
          <input key={day} type="hidden" name="days" value={day} />
        ))}
        <input type="hidden" name="human_natural" value={humanization.natural} />
        <input type="hidden" name="human_moderated" value={humanization.moderated} />
        <input type="hidden" name="human_slow" value={humanization.slow} />
      </form>

      {/* Log de envio */}
      {status === 'active' && (
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6 mt-6">
          <h2 className="text-base font-semibold text-white mb-4">Log de Envio</h2>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-slate-400">
            {log.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}