// Define o fuso horário nativo do Node.js para São Paulo
process.env.TZ = 'America/Sao_Paulo';

import { sqliteInstance } from '@/db';
import { processAiClassifyJob, runAutonomousDiscovery } from '@/features/leads/discovery';
import { generateDailyReport } from '@/features/reports/generate-daily-report';
import { generateWeeklyReport } from '@/features/reports/generate-weekly-report';
import { sendWhatsAppReport } from '@/integrations/callmebot';
import { getSettings } from '@/lib/settings';
import { processFollowUps } from '@/features/conversations/followups';
import { runWhatsAppWorker } from './whatsappWorker';
import { ensureSingleInstance } from './process-lock';

// Garantir apenas uma instância do worker rodando
if (!ensureSingleInstance()) {
  process.exit(1);
}

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
let nextDiscoveryAllowedAt = 0;
let isWhatsAppRunning = false;

function isWithinOperatingWindow(): boolean {
  const sqliteSettings = sqliteInstance.prepare(
    "SELECT key, value FROM system_settings WHERE key IN ('OPERATING_HOURS','OPERATING_TIMEZONE','OPERATING_DAYS')"
  ).all() as { key: string; value: string }[];
  const cfg: Record<string, string> = {};
  for (const r of sqliteSettings) cfg[r.key] = r.value;

  const hours = cfg.OPERATING_HOURS || '09:00-20:00';
  const daysStr = cfg.OPERATING_DAYS || '1,2,3,4,5';
  const allowedDays = daysStr.split(',').map(d => parseInt(d, 10));

  // Agora o Date nativo já está no fuso de São Paulo
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const weekday = now.getDay(); // 0 = Domingo, 6 = Sábado
  const weekdayBr = weekday === 0 ? 0 : weekday; // Converte para Sunday=0, Monday=1, etc.

  console.log(`[DEBUG HORARIO] Hora atual do sistema: ${hour}:${minute.toString().padStart(2, '0')}`);

  const [startStr, endStr] = hours.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  const curM = hour * 60 + minute;
  const withinTime = curM >= startM && curM < endM;
  const withinDay = allowedDays.includes(weekdayBr);
  return withinTime && withinDay;
}

async function runWorker(): Promise<void> {
  const sqlite = sqliteInstance;

  // === LIMPEZA DE JOBS FANTASMAS (pending apenas) ===
  sqlite.prepare(`
    UPDATE jobs SET status = 'failed', error_message = 'Timeout Job Fantasma (pending)'
    WHERE status = 'pending' AND datetime(updated_at) < datetime('now', '-10 minutes')
  `).run();

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
    ORDER BY CASE WHEN type IN ('generate_first_dm', 'send_dm_browser') THEN 0 ELSE 1 END, created_at ASC LIMIT 1
  `).get() as JobRow | undefined;

  if (!job) {
    // Nenhum job disponível, retorna para não processar outros lógicas
    return;
  }

  // === JANELA DE DIAS E HORÁRIOS APENAS PARA ENVIOS (DMs) ===
  if (job && (job.type === 'generate_first_dm' || job.type === 'send_dm_browser') && !isWithinOperatingWindow()) {
    if (!loggedOffHours) {
      console.log(`💤 [WORKER] Fora da janela de envios (Dias/Horário). DMs adiadas.`);
      loggedOffHours = true;
    }
    // Reagenda apenas este job para 5 min no futuro
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    sqlite.prepare(
      `UPDATE jobs SET status = 'pending', run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(future, job.id);
    // Restaura o return para impedir processamento do job fora do horário
    return;
  }
  loggedOffHours = false;

  // === REGRA DO RADAR: Conta apenas jobs de classificação ===
  const aiClassifyJobs = sqlite.prepare(`
    SELECT count(*) as count FROM jobs
    WHERE type = 'ai_classify' AND status IN ('pending', 'running')
  `).get() as { count: number };

  // === RADAR SÓ RODA SE NÃO Houver JOBS PENDENTES ===
  if (!job && Date.now() >= nextDiscoveryAllowedAt && aiClassifyJobs.count <= 4 && !isDiscovering) {
    console.log('[WORKER] Fila de classificação abaixo do limiar (80% do lote). Iniciando radar de prospecção autônomo...');
    isDiscovering = true;
    try {
      const newLeadsCount = await runAutonomousDiscovery();

      // === PAUSA VARIÁVEL APÓS ESGOTO DE HASHTAGS ===
      if (newLeadsCount === 0) {
        const pauseMs = Math.floor(Math.random() * (1200000 - 480000 + 1)) + 480000;
        nextDiscoveryAllowedAt = Date.now() + pauseMs;
        const pauseMin = Math.round(pauseMs / 60000);
        console.log(`💤 [WORKER] Todas as hashtags esgotaram. Pausando radar por ${pauseMin} minutos para evitar banimento.`);
      }
    } catch (err) {
      console.error('[WORKER] Erro no radar autônomo:', err);
    } finally {
      isDiscovering = false;
    }
  }

  if (job) {
    const locked = sqlite.prepare(
      `UPDATE jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`
    ).run(job.id);

    if (locked.changes === 0) {
      return;
    }

    console.log(`⚙️ [WORKER] Executando job ${job.id} (Tipo: ${job.type})...`);

    try {
      if (job && job.type === 'ai_classify') {
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
              `UPDATE jobs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).run(err.message, job.id);
          }
        })();
      } else if (job && job.type === 'daily_report') {
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
      } else if (job && job.type === 'weekly_report') {
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
      } else if (job && job.type === 'whatsapp_worker') {
        (async () => {
          try {
            const { runWhatsAppWorker } = await import('@/worker/whatsappWorker');
            await runWhatsAppWorker();
            sqlite.prepare(`UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
            console.log(`✅ [WORKER] WhatsApp worker job ${job.id} completed.`);
          } catch (err) {
            throw err;
          }
        })();
      } else if (job && job.type === 'generate_first_dm') {
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
                SET channel_status = 'browser_contact_pending', updated_at = CURRENT_TIMESTAMP
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
      } else if (job && job.type === 'send_dm_browser') {
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
      } else if (job) {
        throw new Error(`Tipo de job desconhecido: ${job.type}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (job) {
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
  }
}

// === LOOP AUTÔNOMO DO WHATSAPP (Motor Independente) ===
async function runWhatsAppLoop() {
  if (isWhatsAppRunning) return;
  isWhatsAppRunning = true;
  try {
    await runWhatsAppWorker();
  } catch (err) {
    console.error('[WA LOOP ERROR]', err);
  } finally {
    isWhatsAppRunning = false;
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

// Loop autônomo do WhatsApp (independente do Instagram)
setInterval(() => {
  runWhatsAppLoop();
}, 5000);