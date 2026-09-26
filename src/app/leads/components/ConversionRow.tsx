'use client';

import { useState } from 'react';
import { updateLeadConversionAction } from '../actions';
import DateDisplay from '@/components/DateDisplay';

interface Lead {
  id: number;
  instagram_handle: string;
  created_at: string;
  converted: number;
  conversion_quantity: number;
}

export default function ConversionRow({ lead }: { lead: Lead }) {
  const [converted, setConverted] = useState(lead.converted === 1);
  const [quantity, setQuantity] = useState(lead.conversion_quantity || 1);
  const [saving, setSaving] = useState(false);

  const handleUpdate = async (newConverted: boolean, newQuantity: number) => {
    setSaving(true);
    try {
      await updateLeadConversionAction(lead.id, newConverted, newQuantity);
    } catch (error) {
      console.error('Falha ao atualizar conversão:', error);
      // Reverter estado local em caso de erro se necessário
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex justify-between items-center bg-slate-800 border border-slate-700 rounded-lg p-3 hover:bg-slate-700 transition">
      <div className="flex items-center gap-4">
        <span className="text-slate-200 font-medium">{lead.instagram_handle}</span>
        <span className="text-slate-400 text-sm"><DateDisplay dateString={lead.created_at} /></span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">Conversão:</label>
          <select
            value={converted ? 'true' : 'false'}
            disabled={saving}
            onChange={(e) => {
              const val = e.target.value === 'true';
              setConverted(val);
              handleUpdate(val, val ? quantity : 0);
            }}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-slate-200 text-sm"
          >
            <option value="false">Não</option>
            <option value="true">Sim</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">Quantidade:</label>
          <input
            type="number"
            min="1"
            value={quantity}
            disabled={!converted || saving}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            onBlur={() => {
              if (converted) {
                handleUpdate(true, quantity);
              }
            }}
            className={`w-20 bg-slate-900 border border-slate-700 rounded px-3 py-1 text-slate-200 text-sm ${(!converted || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
        {saving && <span className="text-xs text-emerald-500 animate-pulse">Salvando...</span>}
      </div>
    </div>
  );
}
