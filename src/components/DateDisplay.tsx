'use client';

import { useState, useEffect } from 'react';
import { formatDateAction } from '@/app/actions/format-date-action';

interface DateDisplayProps {
  dateString: string;
}

export default function DateDisplay({ dateString }: DateDisplayProps) {
  const [formattedDate, setFormattedDate] = useState<string>('Carregando...');

  useEffect(() => {
    const format = async () => {
      try {
        const formatted = await formatDateAction(dateString);
        setFormattedDate(formatted);
      } catch (error) {
        console.error('Erro ao formatar data:', error);
        setFormattedDate('Erro');
      }
    };

    format();
  }, [dateString]);

  return <span>{formattedDate}</span>;
}