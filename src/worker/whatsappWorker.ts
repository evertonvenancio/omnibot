import Database from 'better-sqlite3';
import type { Page } from 'playwright';

const WA_CHROME_URL = process.env.WA_CHROME_URL || 'http://127.0.0.1:9223';

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

const OPENAI_API_KEY_WA = process.env.OPENAI_API_KEY_WA;
const OPENAI_BASE_URL_WA = process.env.OPENAI_BASE_URL_WA;

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
  if (!OPENAI_API_KEY_WA) {
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

    const baseUrl = OPENAI_BASE_URL_WA || 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY_WA}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você reescreve mensagens comerciais curtas em português sem mencionar o nome do destinatário.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error(`[WA] IA respondeu status ${res.status}; usando template original.`);
      return template;
    }
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content.trim();
    }
    return template;
  } catch (err) {
    console.error('[WA] Falha na chamada de IA:', err);
    return template;
  }
}

function applyHumanization(message: string, profile: HumanizationProfile): string {
  let result = message;
  if (profile.moderated >= 50) {
    // Insert a small typo on a random word longer than 4 chars
    const words = result.split(/\s+/);
    const candidates = words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.length > 5 && /[a-záéíóúâêôãõç]/i.test(w));
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const w = pick.w;
      const idx = Math.floor(Math.random() * (w.length - 2)) + 1;
      const arr = w.split('');
      const tmp = arr[idx];
      arr[idx] = arr[idx + 1];
      arr[idx + 1] = tmp;
      words[pick.i] = arr.join('');
      result = words.join(' ');
    }
  }
  if (profile.slow >= 50) {
    result = result.split('').join(' ');
  }
  return result;
}

async function getWhatsAppPage(): Promise<Page> {
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP(WA_CHROME_URL);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  await page.goto('https://web.whatsapp.com');
  return page;
}

async function sendMessage(
  page: Page,
  phone: string,
  message: string,
  profile: HumanizationProfile
): Promise<void> {
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=`;
  await page.goto(url);
  await page.waitForTimeout(2500);

  // Wait for message box; if "Número não existe" or invalid number dialog appears, throw
  const inputBox = await page.waitForSelector(
    'div[contenteditable="true"][data-tab="10"]',
    { timeout: 15000 }
  ).catch(() => null);

  if (!inputBox) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    if (/n.o v.lido|not a valid|phone number|n.mero n.o existe/i.test(bodyText)) {
      throw new Error('Número não existe');
    }
    throw new Error('Caixa de mensagem não encontrada');
  }

  if (profile.natural >= 60 || profile.moderated >= 60) {
    await inputBox.click();
    // pressSequentially is only on Locator; cast to any to avoid SVGElement | HTMLElement mismatch
    await (inputBox as any).pressSequentially(message, { delay: 30 });
  } else {
    await inputBox.click();
    await inputBox.fill(message);
  }

  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
}

export async function whatsappWorker(): Promise<void> {
  const db = new Database('data/sqlite.db');
  try {
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

    let page: Page | null = null;
    try {
      page = await getWhatsAppPage();
    } catch (err) {
      console.error('[WA] Falha ao conectar no Chrome via CDP (porta 9223):', err);
      return;
    }

    for (const job of jobs) {
      try {
        const aiMessage = await aiRewrite(campaign.ai_template, profile);
        const finalMessage = applyHumanization(aiMessage, profile);

        let attempt = 0;
        let sent = false;
        let lastError: unknown = null;
        while (attempt < 3 && !sent) {
          attempt++;
          try {
            await sendMessage(page, job.phone, finalMessage, profile);
            sent = true;
          } catch (e) {
            lastError = e;
            console.warn(`[WA] Tentativa ${attempt}/3 falhou para ${job.phone}:`, (e as Error).message);
            await page.waitForTimeout(2000);
          }
        }

        if (sent) {
          db.prepare("UPDATE wa_contacts SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
          console.log(`[WA] Contato ${job.id} (${job.phone}) -> sent`);
        } else {
          db.prepare("UPDATE wa_contacts SET status = 'failed', fail_reason = ? WHERE id = ?").run(
            (lastError as Error)?.message || 'Falha após 3 tentativas',
            job.id
          );
          console.error(`[WA] Contato ${job.id} (${job.phone}) -> failed`);
        }

        await page.waitForTimeout(5000);
      } catch (e) {
        console.error(`[WA] Erro processando contato ${job.id}:`, e);
        db.prepare("UPDATE wa_contacts SET status = 'failed', fail_reason = ? WHERE id = ?").run((e as Error).message, job.id);
      }
    }
  } finally {
    db.close();
  }
}
