import OpenAI from 'openai';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = 'data/sqlite.db';

function getSystemSetting(key: string): string {
  const sqlite = new Database(dbPath, { readonly: true });
  const row = sqlite.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  sqlite.close();
  return row ? row.value : '';
}

function getCurrentMonthCost(): number {
  const sqlite = new Database(dbPath, { readonly: true });
  const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const rows = sqlite.prepare("SELECT estimated_cost_usd FROM ai_calls WHERE called_at LIKE ?").all(`${currentMonthPrefix}%`) as { estimated_cost_usd: string }[];
  sqlite.close();

  let total = 0;
  for (const row of rows) {
    total += parseFloat(row.estimated_cost_usd || '0');
  }
  return total;
}

function sanitizeAiResponse(text: string): string {
  if (/vinicius/i.test(text)) {
    console.log('🚨 [IA FILTER] Nome alucinado detectado e removido.');
    return text.replace(/vinicius/gi, 'amigo');
  }
  return text;
}

function logAiCall(leadId: number | null, model: string, promptTokens: number, completionTokens: number, costUsd: number) {
  const sqlite = new Database(dbPath);
  sqlite.prepare(`
    INSERT INTO ai_calls (lead_id, model, prompt_tokens, completion_tokens, estimated_cost_usd)
    VALUES (?, ?, ?, ?, ?)
  `).run(leadId, model, promptTokens, completionTokens, Number(costUsd.toFixed(6)));
  sqlite.close();
}

export async function generateCompletion(
  systemPromptAddition: string,
  userPrompt: string,
  modelType: 'FAST' | 'NORMAL' = 'NORMAL',
  leadId: number | null = null
): Promise<string> {
  const monthlyBudgetUsd = parseFloat(process.env.OPENAI_MONTHLY_BUDGET_USD || '50');
  const currentSpent = getCurrentMonthCost();

  if (currentSpent >= monthlyBudgetUsd) {
    throw new Error(`[CIRCUIT BREAKER] Orçamento mensal da OpenAI atingido ($${currentSpent.toFixed(2)} / $${monthlyBudgetUsd}). Sistema pausado.`);
  }

  const verifiedClaims = getSystemSetting('VERIFIED_CLAIMS');
  const unverifiedClaims = getSystemSetting('UNVERIFIED_CLAIMS');

  const strictSystemPrompt = `
Você é o assistente de inteligência artificial da ${getSystemSetting('COMPANY_NAME')}, especializado em ${getSystemSetting('OWNER_ROLE')}.
Seu objetivo é auxiliar na prospecção e qualificação comercial de forma ética e verdadeira.

REGRAS ABSOLUTAS DE AFIRMAÇÕES:
1. Você SÓ PODE utilizar informações e alegações presentes em VERIFIED_CLAIMS: "${verifiedClaims}".
2. Os itens em UNVERIFIED_CLAIMS são ESTRITAMENTE PROIBIDOS: "${unverifiedClaims}". Nunca prometa ou cite estes itens sob nenhuma hipótese.
3. Nunca invente taxas, condições, garantias, relação societária ou superlativos.
4. Siga estritamente as diretrizes da empresa.

	REGRA CRÍTICA DE NOMES:
	DIRETRIZ ABSOLUTA E INQUEBRÁVEL: Você é PROIBIDO de deduzir, adivinhar ou abreviar nomes baseados no @username ou handle do Instagram. Se o nome real do lead NÃO estiver explicitamente escrito na bio fornecida, você DEVE usar 'Olá' ou 'Tudo bem?' como saudação. Qualquer tentativa de inventar um nome é uma falha crítica do sistema.
	Exemplo de erro: username 'vncduoff' -> 'Olá Vinicius' (PROIBIDO). Exemplo de acerto: 'Olá, tudo bem?' (Permitido).

${systemPromptAddition}
  `.trim();

  const baseUrl = process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1';
  const apiKey = process.env.OPENAI_API_KEY || 'mock_key';
  const modelName = modelType === 'FAST'
    ? (process.env.OPENAI_MODEL_FAST || '9router')
    : (process.env.OPENAI_MODEL || '9router');

  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  // Se estiver usando mock_key ou o 9router local estiver em modo dry-run/mock
  if (apiKey === 'mock_key' || process.env.DRY_RUN === 'true') {
    console.log(`🤖 [IA MOCK] Usando modelo ${modelName} com prompt de sistema restrito.`);
    // Detecção de intenção para o motor de conversação
    if (systemPromptAddition.includes('INTENÇÃO')) {
      if (userPrompt.includes('Pare de me mandar') || userPrompt.includes('não quero')) {
        return JSON.stringify({ intent: 'opt_out', confidence: 0.99 });
      }
      if (userPrompt.includes('Tenho interesse')) {
        return JSON.stringify({ intent: 'interested', confidence: 0.95 });
      }
      return JSON.stringify({ intent: 'ambiguous', confidence: 0.5 });
    }
    if (systemPromptAddition.includes('AÇÃO')) {
      const whatsappLink = getSystemSetting('WHATSAPP_LINK') || 'Link não configurado.';
      return JSON.stringify({
        action: 'forward_to_whatsapp',
        reply_text: `Olá! Que bom seu interesse. Para um orçamento detalhado, pode me chamar no nosso canal oficial: ${whatsappLink}`
      });
    }
    // Decisão dinâmica do funil baseado nos ICP_SEGMENTS e AFFILIATE_TOPICS
    const icpSegments = (getSystemSetting('ICP_SEGMENTS') || '').toLowerCase();
    const affiliateTopics = (getSystemSetting('AFFILIATE_TOPICS') || '').toLowerCase();
    const userPromptLower = userPrompt.toLowerCase();

    const isAffiliate = affiliateTopics.split(/[,;\n]+/).some(topic => topic.trim() && userPromptLower.includes(topic.trim()));
    const isClient = icpSegments.split(/[,;\n]+/).some(topic => topic.trim() && userPromptLower.includes(topic.trim()));

    return JSON.stringify({
      funnel: isAffiliate && !isClient ? 'B' : 'A',
      score: 85,
      role: 'outros',
      is_icp: true,
      reason: `Perfil aderente aos critérios do banco (${getSystemSetting('COMPANY_NAME')}).`
    });
  }

  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: strictSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
  });

  const content = sanitizeAiResponse(response.choices[0]?.message?.content || '{}');
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

  // Cálculo aproximado de custo (Ex: $0.002 por 1k tokens ou padrão)
  const cost = ((usage.prompt_tokens * 0.001) + (usage.completion_tokens * 0.002)) * 0.01;

  logAiCall(leadId, modelName, usage.prompt_tokens, usage.completion_tokens, cost);

  return content;
}
