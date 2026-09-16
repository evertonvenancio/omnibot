export const STAGES_TRANSLATION: Record<string, string> = {
  qualified: 'Qualificado',
  closed: 'Encerrado',
  contacted: 'Abordado',
  responded: 'Respondeu',
  interested: 'Interessado',
  forwarded_whatsapp: 'Encaminhado',
  forward_whatsapp: 'Encaminhado',
  forwarded_group: 'Encaminhado',
  forward_group: 'Encaminhado',
  REJECTED: 'Rejeitados na triagem',
  descoberto: 'Descoberto'
};

export function translateStatus(status: string): string {
  if (!status) return status;
  return STAGES_TRANSLATION[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatFunnelName(name: string): string {
  if (name === 'direto') return 'Clientes diretos';
  if (name === 'afiliado') return 'Parceiros e afiliados';
  return name;
}
