import Database from 'better-sqlite3';
import { getBrowserContext, createAgentPage, browserMutex } from '@/integrations/browser';
import { Page } from 'playwright';

const dbPath = 'data/sqlite.db';

interface RhythmSettings {
  minSeconds: number;
  maxSeconds: number;
  maxDmsPerDay: number;
  isOperatingHours: boolean;
}

export function getRhythmSettings(): RhythmSettings {
  const sqlite = new Database(dbPath, { readonly: true });
  const settings = sqlite.prepare('SELECT key, value FROM system_settings').all() as any[];
  sqlite.close();

  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const isDryRun = process.env.DRY_RUN === 'true';
  const minSeconds = isDryRun ? 1 : parseInt(process.env.MIN_SECONDS_BETWEEN_DMS || '90');
  const maxSeconds = isDryRun ? 2 : parseInt(process.env.MAX_SECONDS_BETWEEN_DMS || '240');
  const maxDmsPerDay = parseInt(map.MAX_DMS_PER_DAY || '30');

  // Para fins de teste ou se DRY_RUN estiver ativo, podemos ignorar a restrição ou aceitar 00:00-23:59
  let isOperatingHours = true;
  const opHours = map.OPERATING_HOURS || '09:00-20:00';
  if (process.env.DRY_RUN !== 'true') {
    const [startStr, endStr] = opHours.split('-');
    if (startStr && endStr) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      isOperatingHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  return { minSeconds, maxSeconds, maxDmsPerDay, isOperatingHours };
}

export function getTodayDmsCount(): number {
  const sqlite = new Database(dbPath);
  const todayPrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const row = sqlite.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'OUTBOUND' AND sent_at LIKE ?").get(`${todayPrefix}%`) as { count: number };
  sqlite.close();
  return row.count;
}

export async function processSendDmBrowserJob(payloadStr: string): Promise<{ status: string, leadId: number }> {
  const payload = JSON.parse(payloadStr);
  const leadId = payload.leadId;
  const db = new Database(dbPath);

  try {
    // Checagens de ritmo humano e limites
    const rhythm = getRhythmSettings();
    const todayCount = getTodayDmsCount();

    if (!rhythm.isOperatingHours) {
      console.log('⏸️ [WORKER] Fora do horário de operação. Re-enfileirando para o próximo horário válido.');
      const nextRun = new Date();
      nextRun.setHours(9, 0, 0, 0);
      if (nextRun.getTime() <= Date.now()) nextRun.setDate(nextRun.getDate() + 1);

      db.prepare('UPDATE jobs SET status = ?, run_at = ? WHERE id = ?').run('pending', nextRun.toISOString(), payload.jobId);
      return { status: 'rescheduled', leadId };
    }

    if (todayCount >= rhythm.maxDmsPerDay) {
      console.log(`🛑 [WORKER] Limite diário atingido (${todayCount}/${rhythm.maxDmsPerDay}). Re-enfileirando para amanhã.`);
      const nextRun = new Date();
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(9, 0, 0, 0);

      db.prepare('UPDATE jobs SET status = ?, run_at = ? WHERE id = ?').run('pending', nextRun.toISOString(), payload.jobId);
      return { status: 'rescheduled', leadId };
    }

    // Buscar a mensagem draft
    const draftMsg = db.prepare(`SELECT id, content FROM messages WHERE lead_id = ? AND direction = 'OUTBOUND' ORDER BY sent_at DESC LIMIT 1`).get(leadId) as { id: number, content: string };
    if (!draftMsg) throw new Error('Nenhuma mensagem draft encontrada para este lead.');

    // Mutex garante uma aba por vez
    return await browserMutex.runExclusive(async () => {
      const context = await getBrowserContext();
      if (!context) throw new Error('BROWSER_UNAVAILABLE');

      let page = null;
      try {
        page = await createAgentPage(context);
        const lead = db.prepare('SELECT instagram_handle FROM leads WHERE id = ?').get(leadId) as { instagram_handle: string };

        console.log(`🌐 [SEND_DM] Navegando para perfil ${lead.instagram_handle}...`);
        const realPage = page as Page;
        await realPage.goto(`https://www.instagram.com/${lead.instagram_handle.replace('@', '')}/`, { timeout: 30000 });
        await realPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        // Tenta fechar pop-ups iniciais (ex: "Agora não", notificações)
        try {
          const notNowBtn = realPage.getByRole('button', { name: /agora não|not now/i }).first();
          if (await notNowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await notNowBtn.click();
          }
        } catch (e) {
          // ignora se não houver pop-up
        }

        console.log(`🖱️ [SEND_DM] Procurando botão de mensagem...`);

        // Tentativa 1 (PT-BR)
        const msgBtnPt = realPage.getByText('Enviar mensagem', { exact: false }).first();
        // Tentativa 2 (EN)
        const msgBtnEn = realPage.getByText('Message', { exact: false }).first();

        let clicked = false;
        if (await msgBtnPt.isVisible({ timeout: 5000 }).catch(() => false)) {
          await msgBtnPt.click();
          clicked = true;
        } else if (await msgBtnEn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await msgBtnEn.click();
          clicked = true;
        }

        if (!clicked) {
          const title = await realPage.title();
          await realPage.screenshot({ path: `error_lead_${leadId}.png` });
          throw new Error(`Botão de mensagem não encontrado. Título: ${title}. Screenshot salvo em error_lead_${leadId}.png`);
        }

        console.log(`⌨️ [SEND_DM] Digitando mensagem (delay por caractere)...`);
        const textarea = realPage.locator('textarea, div[contenteditable="true"]').first();
        await textarea.pressSequentially(draftMsg.content, { delay: 30 });

        // Envio robusto via Enter
        console.log(`⌨️ [SEND_DM] Pressionando Enter para enviar...`);
        await textarea.press('Enter');

        // Pequena espera para garantir que o envio começou
        await new Promise(r => setTimeout(r, 1000));
        console.log(`✅ [SEND_DM] Comando de envio (Enter) executado.`);

        // Atualiza CRM atomicamente
        const tx = db.transaction(() => {
          db.prepare(`UPDATE messages SET sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(draftMsg.id);
          db.prepare(`UPDATE leads SET pipeline_status = 'contacted', channel_status = 'browser_contact_sent' WHERE id = ?`).run(leadId);
        });
        tx();

        // Delay humano APÓS o envio (antes de fechar o job)
        const randomDelay = Math.floor(Math.random() * (rhythm.maxSeconds - rhythm.minSeconds + 1)) + rhythm.minSeconds;
        console.log(`⏳ [SEND_DM] Aguardando ${randomDelay}s antes de encerrar o job...`);
        await new Promise(r => setTimeout(r, randomDelay * 1000));

        return { status: 'sent', leadId };

      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        if (errorMsg.includes('cannot message this user') || errorMsg.includes('profile_block')) {
          console.warn(`⚠️ [SEND_DM] Lead não permite DMs. Indo para human_review_required.`);
          db.prepare(`UPDATE leads SET channel_status = 'human_review_required' WHERE id = ?`).run(leadId);
          return { status: 'blocked', leadId };
        }
        // Qualquer TimeoutError ou erro de automação: marcar para revisão humana sem matar o worker
        console.error(`❌ [SEND_DM] Erro de automação no lead ${leadId}: ${errorMsg}`);
        try {
          db.prepare(`UPDATE leads SET channel_status = 'human_review_required' WHERE id = ?`).run(leadId);
        } catch (dbErr) {
          console.error(`❌ [SEND_DM] Falha ao atualizar status do lead:`, dbErr);
        }
        return { status: 'error', leadId };
      } finally {
        if (page) {
          await page.close();
          console.log(`🪟 [SEND_DM] Aba do agente fechada (try/finally).`);
        }
      }
    });
  } finally {
    db.close();
  }
}
