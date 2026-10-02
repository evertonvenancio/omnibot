'use client';
import { useState, useEffect } from 'react';
import { createCampaign, startCampaign, toggleWhatsAppPauseAction, cancelCampaign, sendTestMessage, getCampaignStatus } from './actions';
import PageContainer from '@/components/PageContainer';

export default function WhatsAppPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [paused, setPaused] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [createCampaignError, setCreateCampaignError] = useState<string | undefined>(undefined);
  const [startCampaignError, setStartCampaignError] = useState<string | undefined>(undefined);

  const [formTemplate, setFormTemplate] = useState('');
  const [formStartHour, setFormStartHour] = useState('');
  const [formEndHour, setFormEndHour] = useState('');
  const [formMinContacts, setFormMinContacts] = useState('');
  const [formMaxContacts, setFormMaxContacts] = useState('');

  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Load campaign status on mount and after actions (revalidation)
  useEffect(() => {
    (async () => {
      const { status: dbStatus, exists: dbExists, paused: dbPaused } = await getCampaignStatus();
      setStatus(dbStatus);
      setExists(dbExists);
      setPaused(dbPaused);

      // Load existing campaign data if exists
      if (dbExists && dbStatus === 'saved') {
        try {
          const response = await fetch('/api/whatsapp/campaign');
          const data: { success: boolean; error?: string; data: any } = await response.json();

          if (data.success && data.data) {
            console.log('[WA] Campanha existente carregada:', data.data);
            setFormTemplate(data.data.ai_template || '');
            setFormStartHour(data.data.start_hour || '09:00');
            setFormEndHour(data.data.end_hour || '18:00');
            setFormMinContacts(String(data.data.min_contacts || 1));
            setFormMaxContacts(String(data.data.max_contacts || 1));

            if (data.data.days_of_week) {
              const daysArray = data.data.days_of_week.split(',').map((d: string) => d.trim());
              setSelectedDays(daysArray);
            }
            // humanization_profile é mantido interno no banco, não exibido na UI
          }
        } catch (error) {
          console.error('[WA] Erro ao carregar campanha existente:', error);
        }
      }
    })();
  }, []);

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) {
      console.warn('Por favor, preencha o número de telefone.');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('testPhone', testPhone);
      const templateInput = document.getElementById('input-template') as HTMLTextAreaElement;
      formData.append('template', templateInput ? templateInput.value : '');
      const result = await sendTestMessage(formData);
      console.log('Teste de mensagem enviado:', result);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('pt-BR')}] Teste enviado para ${testPhone}`]);
    } catch (error: any) {
      alert('Erro ao montar teste: ' + error.message);
      console.error('Erro ao testar envio:', error);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('pt-BR')}] Erro ao testar envio: ${error.message}`]);
    }
  };

  // Simulated log while campaign is active
  useEffect(() => {
    if (status === 'active') {
      const interval = setInterval(() => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('pt-BR')}] Enviando...`]);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const topBtn = "min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition";
  const labelClass = "text-sm font-medium text-slate-400 mb-1 block";
  const inputClass = "w-full h-10 rounded-lg bg-slate-800 border border-slate-700 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600";
  const baseDayBtn = "w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium";
  const dayBtnClass = (selected: boolean) => selected ? "bg-slate-500 border border-slate-400 text-white" : "bg-slate-800 border border-slate-700 text-slate-300";
  const [fileName, setFileName] = useState<string>('');
  const statusClass = paused ? "text-amber-500 font-semibold" : "text-emerald-500 font-semibold";

  return (
    <PageContainer>
      <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">WhatsApp</h1>
        <div className="flex items-center gap-2">
          <a href="/" className={topBtn}>Voltar</a>
          <form action={async () => {
            setStartCampaignError(undefined);
            try {
              const result = await startCampaign();
              if (!result.success && result.error) {
                setStartCampaignError(result.error);
                alert('Erro ao iniciar campanha: ' + result.error);
                throw new Error(result.error);
              }
            } catch (error: any) {
              console.error('[WA] Erro ao iniciar campanha:', error);
            }
          }} className="inline">
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
      <form id="whatsapp-form" action={async (formData: FormData) => {
        setCreateCampaignError(undefined);
        try {
          const result = await createCampaign(formData);
          if (!result.success && result.error) {
            setCreateCampaignError(result.error);
            throw new Error(result.error);
          }
        } catch (error: any) {
          console.error('[WA] Erro no form:', error);
        }
      }} className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-8 flex flex-col gap-6 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1 (Esquerda) */}
          <div className="flex flex-col gap-6">
            {createCampaignError && (
              <div className="bg-red-900/20 border border-red-800 text-red-400 p-3 rounded-lg text-sm">
                Erro ao criar campanha: {createCampaignError}
              </div>
            )}
            {startCampaignError && (
              <div className="bg-amber-900/20 border border-amber-800 text-amber-400 p-3 rounded-lg text-sm">
                Erro ao iniciar campanha: {startCampaignError}
              </div>
            )}
            {/* Linha 1: Upload de Contatos */}
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

            {/* Linha 2: Hora Início e Fim */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Hora início</label>
                <input
                  type="time"
                  name="start_hour"
                  value={formStartHour}
                  onChange={(e) => setFormStartHour(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Hora fim</label>
                <input
                  type="time"
                  name="end_hour"
                  value={formEndHour}
                  onChange={(e) => setFormEndHour(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Linha 3: Mínimo e Máximo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Mín.</label>
                <input
                  type="number"
                  name="min_contacts"
                  min="1"
                  value={formMinContacts}
                  onChange={(e) => setFormMinContacts(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Máx.</label>
                <input
                  type="number"
                  name="max_contacts"
                  min="1"
                  value={formMaxContacts}
                  onChange={(e) => setFormMaxContacts(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Linha 4: Dias da Campanha */}
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

            {/* Linha 5: Testar Envio */}
            <div>
              <label className={labelClass}>Testar envio</label>
              <div className="flex gap-2 items-center">
                <input
                  type="tel"
                  name="testPhone"
                  id="input-test-phone"
                  placeholder="Número (ex: +5511999999999)"
                  className={inputClass + " flex-1"}
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                />
                <button type="button" onClick={handleTestSend} className={topBtn}>Enviar</button>
              </div>
            </div>
          </div>

          {/* Column 2 (Centro) */}
          <div className="flex flex-col gap-2 h-full">
            <label className="text-sm font-medium text-slate-400">Template da mensagem</label>
            <textarea
              name="ai_template"
              id="input-template"
              value={formTemplate}
              onChange={(e) => setFormTemplate(e.target.value)}
              className="w-full flex-1 min-h-0 resize-none rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="Escreva o template base..."
            />
            <button type="submit" className="h-10 px-4 rounded-lg bg-slate-800 border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-700 w-full">Criar campanha</button>
          </div>

          {/* Column 3 (Direita) */}
          <div className="flex flex-col gap-2 h-full">
            <label className="text-sm font-medium text-slate-400">Log de Envio</label>
            <div className="w-full flex-1 min-h-0 overflow-y-auto rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100">
              {logs.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              {logs.length === 0 && (
                <p className="text-slate-500 italic">Nenhum log disponível</p>
              )}
            </div>
            <button type="button" className="h-10 px-4 rounded-lg bg-slate-800 border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-700 w-full">Exportar Relatório (CSV)</button>
          </div>
        </div>

        {/* Hidden inputs for days and humanization profile */}
        {selectedDays.map(day => (
          <input key={day} type="hidden" name="days" value={day} />
        ))}
        <input type="hidden" name="human_natural" value="60" />
        <input type="hidden" name="human_moderated" value="30" />
        <input type="hidden" name="human_slow" value="10" />
      </form>
    </PageContainer>
  );
}
