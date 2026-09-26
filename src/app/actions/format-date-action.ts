'use server';

import { getSettings } from '@/lib/settings';

export async function formatDateAction(dateString: string): Promise<string> {
  const settings = getSettings();
  const timezone = settings.OPERATING_TIMEZONE || 'America/Sao_Paulo';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Data inválida';
  }

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return formatter.format(date);
}