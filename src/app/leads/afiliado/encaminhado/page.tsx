import Database from 'better-sqlite3';
import DateFilter from '../../components/DateFilter';
import ConversionRow from '../../components/ConversionRow';

export const dynamic = 'force-dynamic';

const dbPath = 'data/sqlite.db';

interface PageProps {
  searchParams: {
    start?: string;
    end?: string;
  };
}

export default function EncaminhadoAfiliadoPage({ searchParams }: PageProps) {
  const { start, end } = searchParams;
  const db = new Database(dbPath, { readonly: true });
  let leads: any[] = [];

  try {
    let whereClause = `funnel_type = 'B_AFFILIATE' AND (pipeline_status = 'forwarded_group' OR pipeline_status = 'forward_group')`;

    if (start && end) {
      whereClause += ` AND created_at BETWEEN '${start} 00:00:00' AND '${end} 23:59:59'`;
    } else if (start) {
      whereClause += ` AND created_at >= '${start} 00:00:00'`;
    } else if (end) {
      whereClause += ` AND created_at <= '${end} 23:59:59'`;
    }

    leads = db.prepare(`SELECT * FROM leads WHERE ${whereClause} ORDER BY created_at DESC`).all();
  } finally {
    db.close();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Parceiros e afiliados / Encaminhado
          </h1>
        </div>
        <a href="/leads" className="min-w-[140px] h-10 px-4 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition">
          Voltar
        </a>
      </header>

      <div className="mb-6 flex justify-end">
        <DateFilter />
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-white mb-4">Leads Encaminhados</h2>

        {leads.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Nenhum lead encontrado nesta etapa.</p>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <ConversionRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
