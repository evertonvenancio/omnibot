import Database from 'better-sqlite3';
import { generateCompletion } from '@/integrations/openai';

const dbPath = 'data/sqlite.db';

export async function generateFirstDm(leadId: number): Promise<string> {
  const sqlite = new Database(dbPath);
  const lead = sqlite.prepare('SELECT instagram_handle, bio FROM leads WHERE id = ?').get(leadId) as any;
  sqlite.close();

  if (!lead) throw new Error('Lead não encontrado');

  const systemAddition = `
Você deve gerar uma DM de abertura curta, pessoal e verdadeira para o seguinte perfil.
O tom deve ser de conversa pessoal, não campanha.
Use as informações da BIO do lead para criar uma conexão real.
Baseie-se nas REGRAS DE AFIRMAÇÕES do sistema.

Retorne APENAS o texto da mensagem.
  `.trim();

  const userPrompt = `
Handle: ${lead.instagramHandle}
Bio: ${lead.bio}
  `.trim();

  const message = await generateCompletion(systemAddition, userPrompt, 'NORMAL', leadId);
  return message || '';
}

export function saveMessageDraft(leadId: number, content: string, channel: 'BROWSER' | 'META_API') {
  const sqlite = new Database(dbPath);
  sqlite.prepare(`
    INSERT INTO messages (lead_id, channel, direction, content)
    VALUES (?, ?, 'OUTBOUND', ?)
  `).run(leadId, channel, content);
  sqlite.close();
}
