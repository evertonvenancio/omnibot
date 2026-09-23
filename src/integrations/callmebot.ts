export async function sendWhatsAppReport(message: string): Promise<{ success: boolean; error?: string }> {
  const dryRun = process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('📱 [EVOLUTION_API - DRY_RUN] Relatório que seria enviado ao WhatsApp:');
    console.log('---');
    console.log(message);
    console.log('---');
    return { success: true };
  }

  const phone = process.env.OPERATOR_WHATSAPP_NUMBER;

  if (!phone) {
    console.error('❌ [EVOLUTION_API] Variável OPERATOR_WHATSAPP_NUMBER ausente.');
    return { success: false, error: 'Configuração de número ausente' };
  }

  // Usamos o novo módulo de integração
  import('./evolution').then(async (mod) => {
    const result = await mod.sendWhatsAppText(phone, message);
    if (!result.success) {
      console.error('❌ [EVOLUTION_API] Falha ao enviar relatório:', result.error);
    }
  });

  return { success: true };
}
