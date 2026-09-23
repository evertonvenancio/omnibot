/**
 * Módulo de Integração com a Evolution API para WhatsApp
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'omnibot_wa';

export async function sendWhatsAppText(number: string, text: string): Promise<{ success: boolean; error?: string }> {
  console.log("[WA EVOLUTION] Número recebido para limpeza:", number);
  if (!number || typeof number !== 'string' || number.trim() === '') {
    throw new Error("Número de telefone vazio ou inválido.");
  }
  const dryRun = process.env.DRY_RUN === 'true';

  const digits = number.replace(/\D/g, '');
  if (!digits) {
    throw new Error("Número de telefone vazio ou inválido.");
  }

  const finalNumber = number.includes('@') ? number.trim() : `${digits}@s.whatsapp.net`;

  if (dryRun) {
    console.log('📱 [EVOLUTION_API - DRY_RUN] Mensagem que seria enviada ao WhatsApp:');
    console.log(`Para: ${finalNumber}`);
    console.log('---');
    console.log(text);
    console.log('---');
    return { success: true };
  }


  if (!EVOLUTION_API_KEY) {
    console.error('❌ [EVOLUTION_API] EVOLUTION_API_KEY não configurada no ambiente.');
    return { success: false, error: 'EVOLUTION_API_KEY não configurada' };
  }

  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: finalNumber,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`❌ [EVOLUTION_API] HTTP ${response.status}: ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText || response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ [EVOLUTION_API] Falha na requisição:', msg);
    return { success: false, error: msg };
  }
}

export async function getWhatsAppConnectionState(): Promise<'open' | 'connecting' | 'close' | 'unknown'> {
  if (!EVOLUTION_API_KEY) {
    return 'unknown';
  }

  const url = `${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    if (!response.ok) {
      return 'unknown';
    }

    const data: any = await response.json();
    const state = data?.instance?.state || data?.state;

    if (state === 'open' || state === 'connecting' || state === 'close') {
      return state;
    }

    return 'unknown';
  } catch (error) {
    console.error('❌ [EVOLUTION_API] Erro ao buscar estado da conexão:', error);
    return 'unknown';
  }
}
