import Database from 'better-sqlite3';
import { generateCompletion } from '@/integrations/openai';
import { sendDirectMessage } from '@/integrations/instagram';

const dbPath = 'data/sqlite.db';

export async function processInboundMessage(payloadStr: string): Promise<void> {
  const payload = JSON.parse(payloadStr);
  const { senderId, messageText, messageId } = payload;
  const sqlite = new Database(dbPath);

  try {
    // 1. Busca o lead pelo ID ou handle
    let lead = sqlite.prepare("SELECT * FROM leads WHERE instagram_handle LIKE ? OR id = ?").get(`%${senderId}%`, senderId) as any;

    if (!lead) {
      console.warn(`⚠️ [HANDOFF] Mensagem de número/ID desconhecido (${senderId}). Ignorando.`);
      return;
    }

    // Atualiza o lead_id na mensagem inbound recém salva
    sqlite.prepare("UPDATE messages SET lead_id = ? WHERE variant = ?").run(lead.id, messageId);

    // 2. Handoff de Canal (Se estava em browser_contact_sent)
    if (['browser_contact_sent', 'waiting_inbound_reply'].includes(lead.channel_status)) {
      console.log(`🔀 [HANDOFF] Lead ${lead.instagram_handle} respondeu! Passando para a API oficial (api_active).`);
      sqlite.prepare("UPDATE leads SET channel_status = 'api_active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lead.id);
      lead.channel_status = 'api_active';
    }

    // 3. Trava de Canal (Anti-duplicidade)
    if (['api_active', 'api_eligible'].includes(lead.channel_status)) {
      // Inicia o motor de conversação da IA
      await processAiConversation(lead.id, messageText);
    } else {
      console.warn(`🚫 [TRAVA DE CANAL] Lead ${lead.instagram_handle} está com status ${lead.channel_status}. Conversação por API bloqueada.`);
    }
  } finally {
    sqlite.close();
  }
}

export async function processAiConversation(leadId: number, inboundText: string): Promise<void> {
  const sqlite = new Database(dbPath);
  const lead = sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as any;
  const history = sqlite.prepare("SELECT direction, content FROM messages WHERE lead_id = ? ORDER BY sent_at ASC").all(leadId) as any[];
  sqlite.close();

  const historyStr = history.map(h => `${h.direction}: ${h.content}`).join('\n');

  // PASSO 1: Classificação (Modelo FAST)
  const classifySystem = `
Analise a mensagem do lead e classifique sua INTENÇÃO em exatamente uma das seguintes categorias:
- interested (demonstrou interesse)
- asked_info (pediu mais informações)
- asked_pricing (perguntou preço)
- wants_whatsapp (quer ir para o WhatsApp / Link de Vendas)
- not_the_owner (não é o decisor / dono)
- will_forward (vai repassar para o responsável)
- objection (apresentou objeção)
- not_interested (não tem interesse)
- opt_out (pediu para parar / não perturbe)
- ambiguous (ambíguo)
- needs_human (precisa de intervenção humana)

Retorne APENAS um JSON:
{ "intent": "...", "confidence": 0.0 a 1.0 }
  `.trim();

  const classifyResponse = await generateCompletion(classifySystem, `Histórico:\n${historyStr}\n\nÚltima mensagem do lead: "${inboundText}"`, 'FAST', leadId);

  if (!classifyResponse) {
    console.error(`🧠 [IA INTENT] Falha ao classificar lead ${lead.instagram_handle}: resposta nula da IA`);
    return;
  }

  const cleanClassifyJson = classifyResponse.replace(/```json/g, '').replace(/```/g, '').trim();
  const classification = JSON.parse(cleanClassifyJson);

  console.log(`🧠 [IA INTENT] Lead ${lead.instagram_handle} classificado como: ${classification.intent} (Confiança: ${classification.confidence})`);

  // REGRA DE INTERESSADO: Grava pipeline_status='interested' para certos intents antes de prosseguir
  if (['interested', 'wants_whatsapp', 'asked_pricing'].includes(classification.intent)) {
    const db = new Database(dbPath);
    db.prepare("UPDATE leads SET pipeline_status = 'interested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(leadId);
    db.close();
    console.log(`💛 [INTERESSADO] Lead ${lead.instagram_handle} marcado como 'interested' temporariamente.`);
  }

  // REGRA DE OPT-OUT IMEDIATO
  if (classification.intent === 'opt_out') {
    const db = new Database(dbPath);
    db.prepare("UPDATE leads SET pipeline_status = 'closed', channel_status = 'do_not_contact' WHERE id = ?").run(leadId);
    db.close();
    console.log(`🛑 [OPT-OUT] Lead ${lead.instagram_handle} marcado como do_not_contact permanentemente.`);
    return;
  }

  // PASSO 2: Ação e Redação (Modelo Principal)
  const actionSystem = `
Com base na intenção "${classification.intent}", decida a AÇÃO (respond, ask, present, handle_objection, forward_to_whatsapp, forward_to_affiliate_group, wait, schedule_followup, close, escalate_to_human) e redija a resposta seguindo estritamente as VERIFIED_CLAIMS.

Se a intenção for wants_whatsapp ou perguntar sobre compra/orçamento para Funil A, a ação DEVE ser forward_to_whatsapp, enviando o link: ${getSettingVal('WHATSAPP_LINK')}.
Se for Funil B (Parceiro), envie o link: ${getSettingVal('AFFILIATE_GROUP_LINK')}.

Retorne APENAS um JSON:
{
  "action": "...",
  "reply_text": "..."
}
  `.trim();

  const actionResponse = await generateCompletion(actionSystem, `Lead Funil: ${lead.funnel_type}\nMensagem: "${inboundText}"`, 'NORMAL', leadId);

  if (!actionResponse) {
    console.error(`🤖 [IA ACTION] Falha ao obter ação para lead ${lead.instagram_handle}: resposta nula da IA`);
    return;
  }

  const cleanActionJson = actionResponse.replace(/```json/g, '').replace(/```/g, '').trim();
  const decision = JSON.parse(cleanActionJson);

  const db = new Database(dbPath);
  try {
    if (decision.action === 'forward_to_whatsapp') {
      db.prepare("UPDATE leads SET pipeline_status = 'forwarded_whatsapp' WHERE id = ?").run(leadId);
    } else if (decision.action === 'forward_to_affiliate_group') {
      db.prepare("UPDATE leads SET pipeline_status = 'forwarded_group' WHERE id = ?").run(leadId);
    } else if (decision.action === 'escalate_to_human') {
      db.prepare("UPDATE leads SET channel_status = 'human_review_required' WHERE id = ?").run(leadId);
      return;
    } else if (decision.action === 'close' || classification.intent === 'not_interested') {
      db.prepare("UPDATE leads SET pipeline_status = 'closed', channel_status = 'do_not_contact' WHERE id = ?").run(leadId);
    }

    if (decision.reply_text && decision.action !== 'escalate_to_human') {
      // Envia pela API oficial da Meta
      const sendResult = await sendDirectMessage(lead.instagram_handle, decision.reply_text);
      if (sendResult.success) {
        db.prepare("INSERT INTO messages (lead_id, channel, direction, content) VALUES (?, 'META_API', 'OUTBOUND', ?)").run(leadId, decision.reply_text);
        console.log(`📤 [AI RESPOND] Resposta enviada para ${lead.instagram_handle}: "${decision.reply_text.substring(0, 40)}..."`);
      }
    }
  } finally {
    db.close();
  }
}

function getSettingVal(key: string): string {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key) as { value: string } | undefined;
  db.close();
  return row ? row.value : '';
}
