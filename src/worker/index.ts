
import { sqliteInstance } from '@/db';
import { processAiClassifyJob, runAutonomousDiscovery } from '@/features/leads/discovery';
import { generateDailyReport } from '@/features/reports/generate-daily-report';
import { generateWeeklyReport } from '@/features/reports/generate-weekly-report';
import { sendWhatsAppReport } from '@/integrations/callmebot';
import { getSettings } from '@/lib/settings';
import { processFollowUps } from '@/features/conversations/followups';

interface JobRow {
  id: number;
  type: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
}

let isDiscovering = false;
let loggedOffHours = false;

function isWithinOperatingWindow(): boolean {
  const sqliteSettings = sqliteInstance.prepare(
    "SELECT key, value FROM system_settings WHERE key IN ('OPERATING_HOURS','OPERATING_TIMEZONE','OPERATING_DAYS')"
  ).all() as { key: string; value: string }[];
  const cfg: Record<string, string> = {};
  for (const r of sqliteSettings) cfg[r.key] = r.value;

  const hours = cfg.OPERATING_HOURS || '09:00-20:00';
  const tz = cfg.OPERATING_TIMEZONE || 'America/Sao_Paulo';
  const daysStr = cfg.OPERATING_DAYS || '1,2,3,4,5';
  const allowedDays = daysStr.split(',').map(d => parseInt(d, 10));

  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'long',
    });
    const parts = fmt.formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';

    const weekdayMap: Record<string, number> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
      Friday: 5, Saturday: 6, Sunday: 0,
    };
    const weekday = weekdayMap[weekdayStr] || 0;

    const [startStr, endStr] = hours.split('-');
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    const curM = hour * 60 + minute;
    const withinTime = curM >= startM && curM < endM;
    const withinDay = allowedDays.includes(weekday);
    return withinTime && withinDay;
  } catch (e) {
    return false;
  }
}

function runWorker(): void {
  const sqlite = sqliteInstance;

  // === BLINDAGEM: PAUSA GERAL DO SISTEMA ===
  const pausedRow = sqlite.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
  if (pausedRow && pausedRow.value === 'true') {
    console.log('🚫 [WORKER] Sistema Instagram Pausado. Aguardando retomada...');
    return;
  }

  // === BLINDAGEM: PAUSA WHATSAPP ===
  const pausedWhatsRow = sqlite.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_WHATSAPP'").get() as { value: string } | undefined;
  if (pausedWhatsRow && pausedWhatsRow.value === 'true') {
    console.log('🚫 [WORKER] Sistema WhatsApp Pausado. Aguardando retomada...');
  }

  // Relatório semanal às 07:00 de segunda-feira
  try {
    const settings = getSettings();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.OPERATING_TIMEZONE || 'America/Sao_Paulo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'long',
    });

    const parts = formatter.formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value;

    if (weekdayPart === 'Monday' && h === 7) {
      const today = new Date().toISOString().split('T')[0];
      const weeklyExists = sqlite.prepare(`
        SELECT id FROM jobs WHERE type = 'weekly_report' AND status IN ('pending', 'running', 'completed') AND date(run_at) = ?
      `).get(today);
      if (!weeklyExists) {
        console.log('📅 [WORKER] Segunda-feira 07:00. Enfileirando relatório semanal...');
        sqlite.prepare(`
          INSERT INTO jobs (type, payload, status, run_at)
          VALUES ('weekly_report', '{}', 'pending', CURRENT_TIMESTAMP)
        `).run();
      }
    }
  } catch (e) {
    // Ignora erros de formatação de horário
  }

  // === DENTRO DO HORÁRIO DE OPERAÇÃO ===
  try {
    processFollowUps();
  } catch (err) {
    console.error('❌ [WORKER] Erro ao processar follow-ups:', err);
  }

  const job = sqlite.prepare(`
    SELECT id, type, payload, status, attempts, max_attempts, error_message
    FROM jobs
    WHERE status = 'pending' AND run_at <= CURRENT_TIMESTAMP
    ORDER BY created_at ASC LIMIT 1
  `).get() as JobRow | undefined;

  if (!job) {
    const criticalJobs = sqlite.prepare(`
      SELECT count(*) as count FROM jobs
      WHERE status = 'pending'
      AND type IN ('ai_classify', 'generate_first_dm', 'send_dm_browser', 'process_inbound_message')
    `).get() as { count: number };

    if (criticalJobs.count === 0 && !isDiscovering) {
      console.log('[WORKER] Fila ociosa. Iniciando radar de prospecção autônomo...');
      isDiscovering = true;
      runAutonomousDiscovery()
        .then(() => {
          isDiscovering = false;
        })
        .catch(err => {
          console.error('[WORKER] Erro no radar autônomo:', err);
          isDiscovering = false;
        });
    }
    return;
  }

  // === JANELA DE DIAS E HORÁRIOS APENAS PARA ENVIOS (DMs) ===
  if ((job.type === 'generate_first_dm' || job.type === 'send_dm_browser') && !isWithinOperatingWindow()) {
    if (!loggedOffHours) {
      console.log(`💤 [WORKER] Fora da janela de envios (Dias/Horário). DMs adiadas.`);
      loggedOffHours = true;
    }
    // Reagenda apenas este job para 5 min no futuro
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    sqlite.prepare(
      `UPDATE jobs SET status = 'pending', run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(future, job.id);
    // Sai da função e espera o próximo setInterval natural de 5 segundos
    return;
  }
  loggedOffHours = false;

  const locked = sqlite.prepare(
    `UPDATE jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`
  ).run(job.id);

  if (locked.changes === 0) {
    return;
  }

  console.log(`⚙️ [WORKER] Executando job ${job.id} (Tipo: ${job.type})...`);

  try {
    if (job.type === 'ai_classify') {
      (async () => {
        try {
          await processAiClassifyJob(job.payload);
          sqlite.prepare(
            `UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(job.id);
          console.log(`✅ [WORKER] Job ${job.id} concluído.`);
        } catch (err: any) {
          console.error(`[WORKER] Erro ao classificar IA:`, err.message);
          sqlite.prepare(
            `UPDATE jobs SET status = 'failed', result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(err.message, job.id);
        }
      })();
    } else if (job.type === 'daily_report') {
      (async () => {
        try {
          const reportText = await generateDailyReport();
          await sendWhatsAppReport(reportText);

          sqlite.prepare(
            `UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(job.id);

          console.log(`✅ [WORKER] Relatório diário enviado.`);
        } catch (err) {
          throw err;
        }
      })();
    } else if (job.type === 'weekly_report') {
      (async () => {
        try {
          const reportText = await generateWeeklyReport();
          await sendWhatsAppReport(reportText);

          sqlite.prepare(
            `UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(job.id);

          console.log(`✅ [WORKER] Relatório semanal enviado.`);
        } catch (err) {
          throw err;
        }
      })();
    } else if (job.type === 'whatsapp_worker') {
      (async () => {
        try {
          const { whatsappWorker } = await import('@/worker/whatsappWorker');
          await whatsappWorker();
          sqlite.prepare(`UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
          console.log(`✅ [WORKER] WhatsApp worker job ${job.id} completed.`);
        } catch (err) {
          throw err;
        }
      })();
    } else if (job.type === 'generate_first_dm') {
      if (process.env.PROSPECTION_ONLY === 'true') {
        console.log('[WORKER] Modo PROSPECTION_ONLY ativo. Envios bloqueados.');
        sqlite.prepare(`UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
        return;
      }
      (async () => {
        try {
          const payload = JSON.parse(job.payload);
          const leadId = payload.leadId;
          const lead = sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as any;

          if (lead) {
            let messageContent = '';
            let promptTokens = 0;
            let completionTokens = 0;
            let estimatedCost = 0;
            let model = 'mock';

            try {
              const prompt = `Gere uma primeira abordagem comercial curta e direta em PT-BR para ${lead.full_name || lead.instagram_handle}, focada em redução de custos operacionais com drones agrícolas DJI para lavouras. Sem emojis.`;
              const { generateCompletion } = await import('@/integrations/openai');
              const aiResult = await generateCompletion('Você é um SDR agrícola experiente.', prompt, 'FAST', lead.id);

              if (!aiResult) {
                console.error(`[WORKER] Erro ao classificar IA para lead ${leadId}: Limite de taxa atingido ou erro 429`);
                messageContent = 'Erro ao gerar resposta da IA - limite de taxa atingido.';
                model = 'fallback';
              } else {
                messageContent = aiResult;
                model = 'gpt-4o-mini';
                promptTokens = prompt.length;
                completionTokens = messageContent.length;
                estimatedCost = (promptTokens / 1000 * 0.00015) + (completionTokens / 1000 * 0.0006);
              }
            } catch (aiErr: any) {
              console.error(`❌ [WORKER] Erro de conexão com a IA para lead ${leadId}:`, aiErr.message);
              messageContent = 'Erro ao conectar com a IA para gerar a primeira DM.';
              model = 'fallback';
            }

            sqlite.prepare(`
              INSERT INTO ai_calls (lead_id, model, prompt_tokens, completion_tokens, estimated_cost_usd)
              VALUES (?, ?, ?, ?, ?)
            `).run(lead.id, model, promptTokens, completionTokens, Number(estimatedCost.toFixed(6)));

            const insertMsg = sqlite.prepare(`
              INSERT INTO messages (lead_id, channel, direction, content, variant)
              VALUES (?, 'BROWSER', 'OUTBOUND', ?, 'draft')
            `).run(lead.id, messageContent);
            console.log(`[WORKER] Mensagem salva no banco para o lead ${lead.id}. MessageId=${insertMsg.lastInsertRowid}`);

            sqlite.prepare(`
              UPDATE leads
              SET pipeline_status = 'contacted', channel_status = 'waiting_inbound_reply', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(lead.id);

            sqlite.prepare(`
              INSERT INTO jobs (type, payload, status, run_at)
              VALUES ('send_dm_browser', ?, 'pending', CURRENT_TIMESTAMP)
            `).run(JSON.stringify({ leadId: lead.id }));
          }

          sqlite.prepare(
            `UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(job.id);

          console.log(`✅ [WORKER] Primeira DM gerada e gravada na timeline para o lead ${leadId}.`);
        } catch (err) {
          throw err;
        }
      })();
    } else if (job.type === 'send_dm_browser') {
      if (process.env.PROSPECTION_ONLY === 'true') {
        console.log('[WORKER] Modo PROSPECTION_ONLY ativo. Envios bloqueados.');
        sqlite.prepare(`UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
        return;
      }
      (async () => {
        try {
          const { processSendDmBrowserJob } = await import('@/features/conversations/send-dm-browser');
          const result = await processSendDmBrowserJob(JSON.stringify({ ...JSON.parse(job.payload), jobId: job.id }));

          if (result.status === 'rescheduled') {
            console.log(`⏳ [WORKER] Job ${job.id} reagendado.`);
          } else {
            sqlite.prepare(
              `UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).run(job.id);
            console.log(`✅ [WORKER] Job ${job.id} concluído com status: ${result.status}.`);
          }
        } catch (err) {
          console.error(`❌ [WORKER] Erro crítico no processamento de DM via navegador:`, err);
          const payload = JSON.parse(job.payload);
          sqlite.prepare(`UPDATE leads SET channel_status = 'human_review_required' WHERE id = ?`).run(payload.leadId);
          throw err;
        }
      })();
    } else {
      throw new Error(`Tipo de job desconhecido: ${job.type}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = job.max_attempts || 3;
    const isDead = attempts >= maxAttempts;

    sqlite.prepare(
      `UPDATE jobs
       SET status = ?, attempts = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(isDead ? 'dead_letter' : 'failed', attempts, error.message, job.id);

    console.error(`❌ [WORKER] Job ${job.id} falhou (Tentativa ${attempts}):`, error.message);
  }
}

console.log('🚀 Worker iniciado. Monitorando jobs...');
setInterval(() => {
  try {
    runWorker();
  } catch (e) {
    console.error('❌ [WORKER] Crash no setInterval:', e);
  }
}, 5000);
