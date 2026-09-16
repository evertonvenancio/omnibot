'use client';

import { useRef, useState } from 'react';
import { saveSettingsAction } from '../actions';

interface FieldDef {
  name: string;
  label: string;
  type?: string;
  rows?: number;
}

const INPUT_CLS = 'w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:ring-1 focus:ring-slate-600 focus:outline-none text-sm';
const TEXTAREA_CLS = 'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:ring-1 focus:ring-slate-600 focus:outline-none text-sm resize-none';
const BTN_CLS = 'min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition text-sm';

const baseDayBtn = "w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium transition cursor-pointer";
const dayBtnClass = (selected: boolean) => selected ? "bg-slate-500 border border-slate-400 text-white" : "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700";

function FieldInput(props: { name: string; label: string; type?: string; rows?: number; value: string }) {
  const { name, label, type, rows, value } = props;
  const isTextarea = type === 'textarea';
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {isTextarea ? (
        <textarea name={name} rows={rows ?? 2} defaultValue={value} className={TEXTAREA_CLS} />
      ) : (
        <input type={type ?? 'text'} name={name} defaultValue={value} className={INPUT_CLS} />
      )}
   </div>
  );
}

export default function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialDays = (settings['OPERATING_DAYS'] || '').split(',').filter(Boolean);
  const [selectedDays, setSelectedDays] = useState<string[]>(initialDays);

  const toggleDay = (val: string) => {
    setSelectedDays(prev =>
      prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]
    );
  };

  const identityFields: FieldDef[] = [
    { name: 'OWNER_NAME', label: 'Nome do Responsável' },
    { name: 'OWNER_ROLE', label: 'Cargo / Papel' },
    { name: 'COMPANY_NAME', label: 'Nome da Empresa' },
    { name: 'COMPANY_WEBSITE', label: 'Website' },
    { name: 'INSTAGRAM_HANDLE', label: 'Instagram' },
    { name: 'WHATSAPP_LINK', label: 'Link do WhatsApp Comercial' },
    { name: 'AFFILIATE_GROUP_LINK', label: 'Link do Grupo de Afiliados' },
  ];

  const businessFields: FieldDef[] = [
    { name: 'ONE_LINE_PITCH', label: 'Pitch de Uma Linha', type: 'textarea', rows: 4 },
    { name: 'HOW_IT_WORKS', label: 'Como Funciona', type: 'textarea', rows: 4 },
    { name: 'REVENUE_MODEL', label: 'Modelo de Receita', type: 'textarea', rows: 4 },
    { name: 'MARKET_JARGON', label: 'Jargão de Mercado', type: 'textarea', rows: 4 },
    { name: 'VERIFIED_CLAIMS', label: 'Alegações Verificadas (Permitidas)', type: 'textarea', rows: 4 },
    { name: 'UNVERIFIED_CLAIMS', label: 'Alegações Bloqueadas', type: 'textarea', rows: 4 },
  ];

  const funnelAFields: FieldDef[] = [
    { name: 'ICP_SEGMENTS', label: 'Segmentos de Clientes-Alvo', type: 'textarea', rows: 2 },
    { name: 'ICP_KEYWORDS', label: 'Palavras-chave de Interesse', type: 'textarea', rows: 2 },
    { name: 'GEOGRAPHY', label: 'Região de Atuação' },
  ];

  const funnelBFields: FieldDef[] = [
    { name: 'AFFILIATE_TOPICS', label: 'Tópicos para Afiliados', type: 'textarea', rows: 2 },
  ];

  const limitFields: FieldDef[] = [
    { name: 'MAX_DMS_PER_DAY', label: 'Máx. DMs por Dia', type: 'number' },
    { name: 'OPERATING_HOURS', label: 'Horário de Operação' },
    { name: 'OPERATING_TIMEZONE', label: 'Fuso Horário (Timezone)' },
  ];

  const days = [
    { label: 'Seg', val: '1' },
    { label: 'Ter', val: '2' },
    { label: 'Qua', val: '3' },
    { label: 'Qui', val: '4' },
    { label: 'Sex', val: '5' },
    { label: 'Sáb', val: '6' },
    { label: 'Dom', val: '7' },
  ];

  return (
    <form ref={formRef} action={saveSettingsAction} className="flex flex-col h-full">
      <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Configurações</h1>
        <div className="flex items-center gap-2">
          <a href="/leads" className={BTN_CLS}>Voltar</a>
          <button
            type="reset"
            onClick={() => {
              formRef.current?.reset();
              setSelectedDays(initialDays);
            }}
            className={BTN_CLS}
          >
            Cancelar
          </button>
          <button type="submit" className={BTN_CLS}>Salvar</button>
        </div>
      </header>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl flex-1">
        <div className="space-y-8">
          <div>
            <h2 className="text-base font-semibold text-white mb-2">1. Identidade e Canais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {identityFields.map((f) => (
                <FieldInput key={f.name} name={f.name} label={f.label} type={f.type} rows={f.rows} value={settings[f.name] || ''} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-white mb-2">2. Negócio e Regras de IA</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {businessFields.map((f) => (
                <FieldInput key={f.name} name={f.name} label={f.label} type={f.type} rows={f.rows} value={settings[f.name] || ''} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-white mb-2">3. Clientes Diretos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {funnelAFields.map((f) => (
                <FieldInput key={f.name} name={f.name} label={f.label} type={f.type} rows={f.rows} value={settings[f.name] || ''} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-white mb-2">4. Parceiros e Afiliados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {funnelBFields.map((f) => (
                <FieldInput key={f.name} name={f.name} label={f.label} type={f.type} rows={f.rows} value={settings[f.name] || ''} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-white mb-2">5. Limites e Horários</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {limitFields.map((f) => (
                <FieldInput key={f.name} name={f.name} label={f.label} type={f.type} rows={f.rows} value={settings[f.name] || ''} />
              ))}
            </div>
            <div className="mt-6">
              <label className="block text-xs text-slate-400 mb-3">Dias de Operação (Envios)</label>
              <div className="flex gap-2">
                {days.map(d => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => toggleDay(d.val)}
                    className={`${baseDayBtn} ${dayBtnClass(selectedDays.includes(d.val))}`}
                  >
                    {d.label}
                  </button>
                ))}
                <input type="hidden" name="OPERATING_DAYS" value={selectedDays.join(',')} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
