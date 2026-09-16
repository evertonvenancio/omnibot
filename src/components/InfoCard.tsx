import React from 'react';

interface InfoCardProps {
  title: string; // ex.: "Instagram" ou "WhatsApp"
  value: string | number; // valor principal a exibir
  label: string; // descrição do valor (ex.: "Empresa", "Resumo da semana")
  status?: boolean; // true => operacional (exibe dot cinza), false oculta
}

export default function InfoCard({ title, value, label, status = true }: InfoCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {status && (
          <span
            className="w-3 h-3 rounded-full bg-slate-600"
            title="Operacional"
          />
        )}
      </div>

      {/* Valor principal */}
      <p className="text-xl font-bold text-white mb-2">{value}</p>

      {/* Descrição */}
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
