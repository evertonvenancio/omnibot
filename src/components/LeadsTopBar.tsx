import React from 'react';
import { toggleSystemPauseAction } from '@/app/actions';

type LeadsTopBarProps = {
  paused: boolean;
};

export default function LeadsTopBar({ paused }: LeadsTopBarProps) {
  const statusClass = paused ? 'text-amber-500 font-semibold' : 'text-emerald-500 font-semibold';
  const label = paused ? 'Retomar' : 'Pausar';
  return (
    <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Instagram</h1>
      </div>
      <div className="flex items-center gap-2">
        <a href="/" className="min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition">
          Voltar
        </a>
        <a href="/settings" className="min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition">
          Configurações
        </a>
        <a href="/exceptions" className="min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition">
          Exceções
        </a>
        {/* Botão Pausar/Retomar */}
        <form action={toggleSystemPauseAction} className="inline">
          <button type="submit" className={`min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 ${statusClass} rounded-lg font-medium transition`}>{label}</button>
        </form>
      </div>
    </header>
  );
}
