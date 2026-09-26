interface OperatingTimezoneResult {
  timezone: string;
  formattedDate: string;
}

async function getOperatingTimezone(): Promise<string> {
  // Import dinâmico para evitar problemas no build
  const { getSettings } = await import('./settings');
  const settings = getSettings();
  return settings.OPERATING_TIMEZONE || 'America/Sao_Paulo';
}

export async function formatDateWithTimezone(dateString: string): Promise<OperatingTimezoneResult> {
  const timezone = await getOperatingTimezone();

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return {
      timezone,
      formattedDate: 'Data inválida'
    };
  }

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return {
    timezone,
    formattedDate: formatter.format(date)
  };
}

export async function formatDate(dateString: string): Promise<string> {
  const result = await formatDateWithTimezone(dateString);
  return result.formattedDate;
}