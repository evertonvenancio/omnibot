import Database from 'better-sqlite3';
import { sendWhatsAppText } from '../integrations/evolution';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

interface WaContactRow {
  id: number;
  campaign_id: number;
  name: string;
  phone: string;
  status: string;
}

interface WaCampaignRow {
  id: number;
  ai_template: string;
  start_hour: string;
  end_hour: string;
  days_of_week: string;
  min_contacts: number;
  max_contacts: number;
  humanization_profile: string;
}

interface HumanizationProfile {
  natural: number;
  moderated: number;
  slow: number;
}

const OPENAI_API_KEY_WA = process.env.OPENAI_API_KEY_WHATSAPP || process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL_WA = process.env.OPENAI_BASE_URL_WHATSAPP || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1';
const OPENAI_MODEL_WA = process.env.OPENAI_MODEL_WHATSAPP || process.env.OPENAI_MODEL || '9router';

function isWithinOperatingWindow(campaign: WaCampaignRow): boolean {
  const daysStr = campaign.days_of_week || 'Seg,Ter,Qua,Qui,Sex';
  const allowedDays = daysStr.split(',').map(d => d.trim());

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'long',
  });
  const parts = fmt.formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';

  const weekdayMapPt: Record<string, string> = {
    Monday: 'Seg', Tuesday: 'Ter', Wednesday: 'Qua', Thursday: 'Qui',
    Friday: 'Sex', Saturday: 'Sáb', Sunday: 'Dom',
  };
  const todayPt = weekdayMapPt[weekdayStr] || '';
  if (!allowedDays.includes(todayPt)) return false;

  const [sh, sm] = (campaign.start_hour || '09:00').split(':').map(Number);
  const [eh, em] = (campaign.end_hour || '18:00').split(':').map(Number);
  const curM = hour * 60 + minute;
  return curM >= sh * 60 + sm && curM < eh * 60 + em;
}

async function aiRewrite(template: string, profile: HumanizationProfile): Promise<string> {
  if (!OPENAI_API_KEY_WA && process.env.DRY_RUN !== 'true') {
    return template;
  }
  try {
    const style =
      profile.natural >= profile.moderated && profile.natural >= profile.slow
        ? 'natural e profissional'
        : profile.moderated >= profile.slow
        ? 'moderado (com algumas pausas)'
        : 'lento e cuidadoso (texto bem espaçado)';

    const prompt = `Reescreva a mensagem abaixo em PT-BR, mantendo o sentido original, sem usar o nome do destinatário. Use um tom ${style}. A mensagem NÃO deve conter o nome da pessoa. Responda apenas com a mensagem reescrita, sem comentários. Mensagem original: """${template}"""`;

    if (process.env.DRY_RUN === 'true' || OPENAI_API_KEY_WA === 'mock_key' || !OPENAI_API_KEY_WA) {
      return template;
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY_WA,
      baseURL: OPENAI_BASE_URL_WA,
    });

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_WA,
      messages: [
        { role: 'system', content: 'Você reescreve mensagens comerciais curtas em português sem mencionar o nome do destinatário.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content.trim();
    }
    return template;
  } catch (err) {
    console.error('[WA] Falha na chamada de IA:', err);
    return template;
  }
}

export async function whatsappWorker(): Promise<void> {
  const db = new Database(dbPath);
  try {
    const pausedRow = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
    if (pausedRow?.value === 'true') {
      console.log('[WA] Módulo pausado por system_settings (SYSTEM_PAUSED_WHATSAPP).');
      return;
    }

    const campaign = db
      .prepare("SELECT id, ai_template, start_hour, end_hour, days_of_week, min_contacts, max_contacts, humanization_profile FROM wa_campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get() as WaCampaignRow | undefined;

    if (!campaign) {
      console.log('[WA] Nenhuma campanha ativa.');
      return;
    }

    if (!isWithinOperatingWindow(campaign)) {
      console.log('[WA] Fora da janela de envio (dia/horário).');
      return;
    }

    const profile = JSON.parse(campaign.humanization_profile) as HumanizationProfile;
    const min = campaign.min_contacts || 1;
    const max = campaign.max_contacts || 1;
    const targetCount = Math.floor(Math.random() * (max - min + 1)) + min;

    const jobs = db
      .prepare(
        "SELECT id, campaign_id, name, phone, status FROM wa_contacts WHERE campaign_id = ? AND status = 'pending' LIMIT ?"
      )
      .all(campaign.id, targetCount) as WaContactRow[];

    if (jobs.length === 0) {
      console.log('[WA] Sem contatos pendentes.');
      return;
    }

    for (const job of jobs) {
      try {
        const aiMessage = await aiRewrite(campaign.ai_template, profile);
        // O perfil de humanização controla o timing/atraso entre envios, sem digitação caractere por caractere.
        const finalMessage = aiMessage;

        let attempt = 0;
        let sent = false;
        let lastError: string | undefined = undefined;
        while (attempt < 3 && !sent) {
          attempt++;
          const result = await sendWhatsAppText(job.phone, finalMessage);
          if (result.success) {
            sent = true;
          } else {
            lastError = result.error;
            console.warn(`[WA] Tentativa ${attempt}/3 falhou para ${job.phone}:`, result.error);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (sent) {
          db.prepare("UPDATE wa_contacts SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
          console.log(`[WA] Contato ${job.id} (${job.phone}) -> sent`);
        } else {
          db.prepare("UPDATE wa_contacts SET status = 'failed', fail_reason = ? WHERE id = ?").run(
            lastError || 'Falha após 3 tentativas',
            job.id
          );
          console.error(`[WA] Contato ${job.id} (${job.phone}) -> failed`);
        }

        // Timing de humanização entre disparos (ex: delay baseado no perfil)
        const delayMs = profile.slow >= 50 ? 10000 : profile.moderated >= 50 ? 6000 : 3000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (e) {
        console.error(`[WA] Erro processando contato ${job.id}:`, e);
        db.prepare("UPDATE wa_contacts SET status = 'failed', fail_reason = ? WHERE id = ?").run((e as Error).message, job.id);
      }
    }
  } finally {
    db.close();
  }
}
