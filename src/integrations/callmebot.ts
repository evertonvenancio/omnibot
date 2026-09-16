export async function sendWhatsAppReport(message: string): Promise<{ success: boolean; error?: string }> {
  const dryRun = process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('📱 [CALLMEBOT - DRY_RUN] Mensagem que seria enviada ao WhatsApp:');
    console.log('---');
    console.log(message);
    console.log('---');
    return { success: true };
  }

  const apiKey = process.env.CALLMEBOT_API_KEY;
  const phone = process.env.OPERATOR_WHATSAPP_NUMBER;

  if (!apiKey || !phone) {
    console.error('❌ [CALLMEBOT] Variáveis CALLMEBOT_API_KEY ou OPERATOR_WHATSAPP_NUMBER ausentes.');
    return { success: false, error: 'Configuração ausente' };
  }

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ [CALLMEBOT] HTTP ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ [CALLMEBOT] Falha na requisição:', msg);
    return { success: false, error: msg };
  }
}
