'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

type PeriodFilterProps = {
  periodoAtual?: string;
};

export default function PeriodFilter({ periodoAtual }: PeriodFilterProps) {
  const router = useRouter();
  const [month, setMonth] = useState<string>('');
  const [year, setYear] = useState<string>('');

  // Initialize selects if periodoAtual is provided (e.g., "2026-09")
  React.useEffect(() => {
    if (periodoAtual && periodoAtual !== 'todos') {
      const [y, m] = periodoAtual.split('-');
      setYear(y);
      setMonth(m.replace(/^0+/, '')); // remove leading zero for select value
    } else {
      setMonth('');
      setYear('');
    }
  }, [periodoAtual]);

  const applyFilter = () => {
    if (year && month) {
      const mPadded = month.padStart(2, '0');
      router.push(`/leads?periodo=${year}-${mPadded}`);
    }
  };

  const clearFilter = () => {
    router.push('/leads');
  };

  return (
    <div className="my-6 flex items-center gap-4">
      <select value={month} onChange={e => setMonth(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-100 rounded p-2">
        <option value="">Mês</option>
        {[...Array(12)].map((_, i) => {
          const m = (i + 1).toString();
          return <option key={m} value={m}>{m}</option>;
        })}
      </select>
      <select value={year} onChange={e => setYear(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-100 rounded p-2">
        <option value="">Ano</option>
        {[2023,2024,2025,2026,2027].map(y => (
          <option key={y} value={y.toString()}>{y}</option>
        ))}
      </select>
      <button onClick={applyFilter} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded">
        Filtrar
      </button>
      <button onClick={clearFilter} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded">
        Todos os períodos
      </button>
    </div>
  );
}
