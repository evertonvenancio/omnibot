import Database from 'better-sqlite3';
import { generateCompletion } from '@/integrations/openai';
import { sendDirectMessage } from '@/integrations/instagram';

const dbPath = process.env.DATABASE_URL || 'data/sqlite.db';

export async function processFollowUps(): Promise<void> {
  const sqlite = new Database(dbPath);
  try {
    const now = new Date();

    // --- 1. Follow-up 1 (Navegador - 3 dias após 1ª DM) ---
    // Condição: pipeline_status = 'contacted', channel_status = 'waiting_inbound_reply', followup_step = 0, updated_at <= now - 3 days
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const leadsFu1 = sqlite.prepare(`
      SELECT * FROM leads
      WHERE pipeline_status = 'contacted'
        AND channel_status = 'waiting_inbound_reply'
        AND (followup_step IS NULL OR followup_step = 0)
        AND updated_at <= ?
    `).all(threeDaysAgo) as any[];

    for (const lead of leadsFu1) {
      console.log(`🔄 [FOLLOWUP 1] Gerando follow-up 1 para lead ${lead.instagram_handle}`);

      const prompt = `Gerar mensagem curta de acompanhamento (follow-up 1) em PT-BR para ${lead.full_name || lead.instagram_handle}, lembrando da mensagem anterior sobre redução de custo de operação com drones agrícolas. Sem emojis.`;
      const reply = await generateCompletion('Você é um SDR agrícola profissional.', prompt, 'FAST', lead.id) || '';

      // Salva mensagem no histórico
      sqlite.prepare(`
        INSERT INTO messages (lead_id, channel, direction, content)
        VALUES (?, 'BROWSER', 'OUTBOUND', ?)
      `).run(lead.id, reply);

      // Enfileira job send_dm_browser ou marca passo 1
      sqlite.prepare(`
        UPDATE leads
        SET followup_step = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(lead.id);

      sqlite.prepare(`
        INSERT INTO jobs (type, payload, status, run_at)
        VALUES ('send_dm_browser', ?, 'pending', CURRENT_TIMESTAMP)
      `).run(JSON.stringify({ leadId: lead.id }));
    }

    // --- 2. Follow-up 2 (Navegador - 5 dias após o Follow-up 1) ---
    // Condição: followup_step = 1, updated_at <= now - 5 days, sem resposta
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const leadsFu2 = sqlite.prepare(`
      SELECT * FROM leads
      WHERE followup_step = 1
        AND pipeline_status = 'contacted'
        AND channel_status = 'waiting_inbound_reply'
        AND updated_at <= ?
    `).all(fiveDaysAgo) as any[];

    const whatsappLink = getSettingVal(sqlite, 'WHATSAPP_LINK') || 'https://wa.me/';

    for (const lead of leadsFu2) {
      console.log(`🔄 [FOLLOWUP 2] Aplicando follow-up final (encerramento) para ${lead.instagram_handle}`);
      const text = `Olá ${lead.full_name || 'produtor'}, agradeço o espaço. Não quero ser invasivo. Deixo meu contato direto caso mude de ideia ou queira saber mais sobre os drones DJI: ${whatsappLink}. Um ótimo trabalho na fazenda!`;

      sqlite.prepare(`
        INSERT INTO messages (lead_id, channel, direction, content)
        VALUES (?, 'BROWSER', 'OUTBOUND', ?)
      `).run(lead.id, text);

      sqlite.prepare(`
        UPDATE leads
        SET pipeline_status = 'closed', channel_status = 'completed', followup_step = 2, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(lead.id);

      sqlite.prepare(`
        INSERT INTO jobs (type, payload, status, run_at)
        VALUES ('send_dm_browser', ?, 'pending', CURRENT_TIMESTAMP)
      `).run(JSON.stringify({ leadId: lead.id }));
    }

    // --- 3. Follow-up API (48h após conversa esfriar) ---
    // Condição: channel_status = 'api_active', updated_at <= now - 48 hours
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const leadsApi = sqlite.prepare(`
      SELECT * FROM leads
      WHERE channel_status = 'api_active'
        AND pipeline_status NOT IN ('closed', 'forwarded_whatsapp', 'forwarded_group')
        AND (followup_step IS NULL OR followup_step < 3)
        AND updated_at <= ?
    `).all(twoDaysAgo) as any[];

    for (const lead of leadsApi) {
      if (!lead.followup_step || lead.followup_step === 0) {
        console.log(`🔄 [FOLLOWUP API] Enviando follow-up de API para ${lead.instagram_handle}`);
        const prompt = `Olá ${lead.full_name || 'produtor'}, tudo bem? Ficou alguma dúvida sobre os drones ou sobre o curso CAAR? Fico à disposição para te ajudar no que precisar.`;

        await sendDirectMessage(lead.instagram_handle, prompt);
        sqlite.prepare(`
          INSERT INTO messages (lead_id, channel, direction, content)
          VALUES (?, 'META_API', 'OUTBOUND', ?)
        `).run(lead.id, prompt);

        sqlite.prepare(`
          UPDATE leads
          SET followup_step = 3, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(lead.id);
      } else if (lead.followup_step === 3) {
        // Passou mais 48h desde o follow-up API sem resposta -> Envia link WhatsApp e fecha
        console.log(`🔄 [FOLLOWUP API FINAL] Fechando lead ${lead.instagram_handle} por inatividade`);
        const text = `Olá ${lead.full_name || 'produtor'}, para não ocupar seu espaço, deixo meu contato direto no WhatsApp caso precise de consultoria sobre os drones DJI: ${whatsappLink}. Sucesso na safra!`;

        await sendDirectMessage(lead.instagram_handle, text);
        sqlite.prepare(`
          INSERT INTO messages (lead_id, channel, direction, content)
          VALUES (?, 'META_API', 'OUTBOUND', ?)
        `).run(lead.id, text);

        sqlite.prepare(`
          UPDATE leads
          SET pipeline_status = 'closed', channel_status = 'completed', followup_step = 4, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(lead.id);
      }
    }


  } finally {
    sqlite.close();
  }
}

function getSettingVal(sqlite: any, key: string): string {
  const row = sqlite.prepare("SELECT value FROM system_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : '';
}
