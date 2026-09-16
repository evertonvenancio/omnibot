'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function DateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';

  const handleFilter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const s = formData.get('start') as string;
    const ev = formData.get('end') as string;

    const params = new URLSearchParams(searchParams);
    if (s) params.set('start', s); else params.delete('start');
    if (ev) params.set('end', ev); else params.delete('end');

    router.push(`?${params.toString()}`);
  };

  const clear = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('start');
    params.delete('end');
    router.push(`?${params.toString()}`);
  };

  return (
    <form onSubmit={handleFilter} className="flex items-center gap-2">
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1">
        <label className="text-xs text-slate-500 font-medium">De:</label>
        <input
          type="date"
          name="start"
          defaultValue={start}
          className="bg-transparent text-slate-200 text-sm focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1">
        <label className="text-xs text-slate-500 font-medium">Até:</label>
        <input
          type="date"
          name="end"
          defaultValue={end}
          className="bg-transparent text-slate-200 text-sm focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-10 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition text-sm"
      >
        Filtrar
      </button>
      <button
        type="button"
        onClick={clear}
        className="h-10 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 rounded-lg font-medium transition text-sm"
      >
        Todos os períodos
      </button>
    </form>
  );
}
