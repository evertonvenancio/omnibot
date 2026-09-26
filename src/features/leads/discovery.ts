import Database from 'better-sqlite3';
import { chromium, Locator } from 'playwright';
import { generateCompletion } from '@/integrations/openai';

const dbPath = 'data/sqlite.db';

async function safeText(locator: Locator): Promise<string> {
  try {
    const text = await locator.textContent({ timeout: 2000 });
    return (text || '').trim();
  } catch (e) {
    return '';
  }
}

export function enqueueDiscoveryJobs() {
  console.log('[DISCOVERY] Placeholder for enqueueDiscoveryJobs');
}

export async function runAutonomousDiscovery(): Promise<number> {
  console.log('[DISCOVERY] Iniciando radar autônomo...');
  const db = new Database(dbPath);
  let browser: any;
  let page: any;
  let newLeadsCount = 0;

  try {
    // 1. Hashtags Dinâmicas & Rotação
    const settings = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ICP_KEYWORDS') as { value: string } | undefined;
    if (!settings || !settings.value) {
      console.log('[DISCOVERY] Nenhuma ICP_KEYWORDS configurada.');
      return 0;
    }

    const keywords = settings.value.split(' ').filter(k => k.startsWith('#')).map(k => k.replace('#', ''));
    if (keywords.length === 0) return 0;

    let lastIdxSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('last_discovery_hashtag') as { value: string } | undefined;
    let nextIdx = 0;
    if (lastIdxSetting && lastIdxSetting.value) {
      nextIdx = (parseInt(lastIdxSetting.value, 10) + 1) % keywords.length;
    }

    const targetHashtag = keywords[nextIdx];
    console.log(`[DISCOVERY] Rotação de Hashtag: índice ${nextIdx}/${keywords.length} -> #${targetHashtag}`);

    // Salva o novo índice no banco
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('last_discovery_hashtag', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(String(nextIdx));

    // 2. Connect to Chrome
    const cdpUrl = process.env.CHROME_CDP_URL || 'http://localhost:9222';
    browser = await Promise.race([
      chromium.connectOverCDP(cdpUrl),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout CDP 15s')), 15000)
      )
    ]);
    const context = browser.contexts()[0];
    page = await context.newPage();

    try {
      await page.goto(`https://www.instagram.com/explore/tags/${targetHashtag}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('article, main', { timeout: 10000 }).catch(() => {});
    } catch (err) {
      console.warn(`[DISCOVERY] Falha ao carregar hashtag #${targetHashtag}:`, err);
      await page.close().catch(() => {});
      return;
    }

    // 3. Coletar links de posts com scroll inteligente e detecção de estagnação
    const postHrefs: string[] = [];
    const seenHrefs = new Set<string>();
    let staleCount = 0;
    let scrollAttempts = 0;

    while (postHrefs.length < 20 && scrollAttempts < 15) {
      const anchors = await page.locator('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]').all();

      // Detectar posts novos nesta rolagem
      const currentBatchHrefs: string[] = [];
      for (const a of anchors) {
        const href = await a.getAttribute('href').catch(() => null);
        if (href && !seenHrefs.has(href)) {
          seenHrefs.add(href);
          currentBatchHrefs.push(href);
          postHrefs.push(href);
          if (postHrefs.length >= 20) break;
        }
      }

      // Atualizar contagem de estagnação
      if (currentBatchHrefs.length === 0) {
        staleCount++;
      } else {
        staleCount = 0;
      }

      // Abortar se 2 rolagens seguidas sem novos posts
      if (staleCount >= 2) {
        console.log(`[DISCOVERY] Feed estagnado após ${scrollAttempts} scrolls. Abortando busca de novos posts.`);
        break;
      }

      // Continuar scroll se ainda não atingimos o alvo
      if (postHrefs.length < 20 && scrollAttempts < 15) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2500);
        scrollAttempts++;
      }
    }

    // 4. Loop Direto nos posts (Anti-Duplicação rigorosa na raiz e por Handle)
    for (const postHref of postHrefs) {
      if (page.isClosed()) break;

      const postUrl = postHref.startsWith('http') ? postHref : `https://www.instagram.com${postHref}`;

      // Memória de URL (Anti-Dup RAIZ)
      const existingPost = db.prepare('SELECT id FROM leads WHERE source_post_url = ?').get(postUrl);
      if (existingPost) {
        console.log(`[DISCOVERY] Post ${postUrl} já processado anteriormente. Pulando.`);
        continue;
      }

      try {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('header, article, main', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);

        let cleanUsername = '';
        const reservedWords = ['explore', 'reels', 'p', 'reel', 'stories', 'direct', 'accounts', 'voltar', 'back', 'home', 'login', 'signup', 'help', 'about', 'press', 'api', 'jobs', 'privacy', 'terms', 'locations', 'language'];

        const candidateAnchors = await page.locator('header a[href^="/"], article a[href^="/"], main a[href^="/"]').all();
        for (const anchor of candidateAnchors) {
          const anchorHref = await anchor.getAttribute('href').catch(() => null);
          if (!anchorHref) continue;
          const segments = anchorHref.split('/').filter(Boolean);
          if (segments.length === 1) {
            const candidate = segments[0];
            const lower = candidate.toLowerCase();
            if (!reservedWords.includes(lower) && /^[a-zA-Z0-9_\.]+$/.test(candidate)) {
              cleanUsername = candidate;
              break;
            }
          }
        }

        if (!cleanUsername) {
          console.log(`[DISCOVERY] Post ${postHref}: nenhum handle de perfil válido encontrado, pulando.`);
          continue;
        }

        // VERIFICAÇÃO RIGOROSA DE ANTI-DUPLICAÇÃO POR HANDLE (Usuário) ANTES DE CONTINUAR
        const existingHandle = db.prepare('SELECT id, pipeline_status FROM leads WHERE instagram_handle = ?').get(cleanUsername) as { id: number; pipeline_status: string } | undefined;

        // Checagem de pausa instantânea no meio da execução
        const pausedCheck = db.prepare("SELECT value FROM system_settings WHERE key = 'SYSTEM_PAUSED_INSTAGRAM'").get() as { value: string } | undefined;
        if (pausedCheck && pausedCheck.value === 'true') {
          console.log('[DISCOVERY] Sistema pausado pelo operador. Abortando radar...');
          break;
        }

        let leadId: number;

        if (existingHandle) {
          leadId = existingHandle.id;
          console.log(`[DISCOVERY] Handle @${cleanUsername} já cadastrado (ID: ${leadId}, Status: ${existingHandle.pipeline_status}). Abortando processamento/jobs para lead duplicado.`);

          // Atualiza a source_post_url se estiver nula
          db.prepare('UPDATE leads SET source_post_url = ? WHERE id = ? AND source_post_url IS NULL').run(postUrl, leadId);
          continue; // ABORTO IMEDIATO DO LEAD DUPLICADO (Não enfileira novos jobs de IA nem gasta créditos)
        }

        // Salva inédito no banco imediatamente
        const info = db.prepare(`
          INSERT INTO leads (instagram_handle, source_post_url, funnel_type, pipeline_status, channel_status)
          VALUES (?, ?, 'A_CLIENT', 'discovered', 'browser_contact_pending')
        `).run(cleanUsername, postUrl);
        leadId = Number(info.lastInsertRowid);
        newLeadsCount++;
        console.log(`[DISCOVERY] Novo lead salvo: ${cleanUsername} (ID: ${leadId})`);

        // LEITURA DINÂMICA DE CONTEXTO (PERFIL)
        await page.goto(`https://www.instagram.com/${cleanUsername}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('header, article, main', { timeout: 10000 }).catch(() => {});
        if (page.isClosed()) break;

        // Extrai Bio e Categoria
        let bio = await safeText(page.locator('header section div span').first());
        if (!bio) bio = await safeText(page.locator('header section > div').nth(2).locator('span').first());
        if (!bio) bio = await safeText(page.locator('header section div').last());

        let category = await safeText(page.locator('header section div div span, header section div div button').first());

        // Extração de Seguidores
        let followersText = '';
        try {
          const followersLocator = page.locator('header section ul li').filter({ hasText: /seguidores|followers|seguindo|following|publicações|posts/i }).first();
          const rawText = await safeText(followersLocator);
          if (rawText) {
            const parts = rawText.split('\n');
            followersText = parts.length > 1 ? parts[0] : rawText.replace(/seguidores|followers|seguindo|following|publicações|posts/gi, '').trim();
          }
        } catch (e) {
          followersText = '';
        }

        // Extração do Link da Bio (Website)
        let bioLink = '';
        try {
          const websiteAnchor = page.locator('header a[href^="http"]:not([href*="instagram.com"])').first();
          bioLink = (await websiteAnchor.getAttribute('href').catch(() => null)) || '';
        } catch (e) {
          bioLink = '';
        }

        // Scroll Dinâmico (1 a 3 vezes) para extrair legendas dos posts recentes
        const recentCaptions: string[] = [];
        for (let scroll = 0; scroll < 2; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await page.waitForTimeout(1000);
          const captions = await page.locator('article img[alt], main img[alt]').all();
          for (const img of captions) {
            const alt = await img.getAttribute('alt').catch(() => null);
            if (alt && alt.length > 15 && !recentCaptions.includes(alt)) {
              recentCaptions.push(alt.substring(0, 150));
              if (recentCaptions.length >= 3) break;
            }
          }
          if (recentCaptions.length >= 3) break;
        }

        // Atualiza a bio no lead
        db.prepare('UPDATE leads SET bio = ? WHERE id = ?').run(bio || '', leadId);

        // Pacote de Contexto
        const contextPayload = {
          leadId,
          instagramHandle: cleanUsername,
          bio: bio || '',
          category: category || '',
          recentCaptions: recentCaptions.join(' | '),
          followers: followersText || '',
          bioLink: bioLink || ''
        };

        // ENFILEIRAMENTO COM BLINDAGEM: Verifica se o lead já tem job ai_classify pendente para evitar redundância
        const existingJob = db.prepare('SELECT id FROM jobs WHERE type = ? AND status = ? AND payload LIKE ?').get('ai_classify', 'pending', `%${cleanUsername}%`);
        if (existingJob) {
          console.log(`[DISCOVERY] Job ai_classify já enfileirado para @${cleanUsername}. Ignorando.`);
        } else {
          db.prepare(`
            INSERT INTO jobs (type, payload, status, run_at)
            VALUES ('ai_classify', ?, 'pending', CURRENT_TIMESTAMP)
          `).run(JSON.stringify(contextPayload));
          console.log(`📥 [DISCOVERY] Contexto montado para @${cleanUsername}. Job ai_classify enfileirado.`);
        }
      } catch (e) {
        console.warn(`[DISCOVERY] Falha ao processar post ${postHref}:`, e);
      }
    }

    } catch (e) {
    console.error('[DISCOVERY] Erro no radar autônomo:', e);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    db.close();
    return newLeadsCount;
  }
}

export interface MockLeadProfile {
  instagramHandle: string;
  fullName?: string;
  bio?: string;
  category?: string;
  recentCaptions?: string;
}

export async function processAiClassifyJob(payloadStr: string): Promise<void> {
  const payload = JSON.parse(payloadStr);
  const leadId = payload.leadId;
  const sqlite = new Database(dbPath);

  try {
    let leadData = sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as any;
    if (!leadData && payload.instagramHandle) {
      leadData = sqlite.prepare('SELECT * FROM leads WHERE instagram_handle = ?').get(payload.instagramHandle) as any;
    }

    const handle = payload.instagramHandle || leadData?.instagram_handle || '';
    const bio = payload.bio || leadData?.bio || '';
    const category = payload.category || '';
    const recentCaptions = payload.recentCaptions || '';
    const followers = payload.followers || '';
    const bioLink = payload.bioLink || '';

    if (!handle) {
      console.log('[CLASSIFY] Handle ausente, abortando job.');
      return;
    }

    // === WHITE-LABEL: Montagem Dinâmica do System Prompt ===
    const configRows = sqlite.prepare("SELECT key, value FROM system_settings").all() as { key: string; value: string }[];
    const config: Record<string, string> = {};
    for (const r of configRows) config[r.key] = r.value;

    const geography = config.GEOGRAPHY || 'Não configurado';
    const icpSegments = config.ICP_SEGMENTS || 'Não configurado';
    const affiliateTopics = config.AFFILIATE_TOPICS || 'Não configurado';
    const companyName = config.COMPANY_NAME || 'Nossa empresa';
    const oneLinePitch = config.ONE_LINE_PITCH || 'Não configurado';
    const revenueModel = config.REVENUE_MODEL || 'Não configurado';

    const systemAddition = `
Você é um SDR Avaliador e Classificador de ICP para ${companyName}.
Analise rigorosamente o Pacote de Contexto (Handle, Bio, Categoria, Legendas, Seguidores, Link da Bio).

PITCH: ${oneLinePitch}
MODELO DE RECEITA DA EMPRESA: ${revenueModel}

REGRA 1 (GEOGRAFIA): O perfil DEVE atuar na região configurada: ${geography}. Se for de outra região ou idioma incompatível, atribua Score 0 e is_icp = false.
REGRA 2 (ADERÊNCIA): O perfil deve se encaixar nos segmentos de clientes: ${icpSegments} OU nos segmentos de parceiros: ${affiliateTopics}. Se não se encaixar em nenhum, atribua Score 0 e is_icp = false.
REGRA 3 (TIPO DE CONTA): Avalie se o perfil é um tomador de decisão adequado para o nicho. Empresas, lojas ou perfis de entretenimento só devem ser aceitos se a configuração do nicho assim permitir (não bloqueie empresas por padrão, a menos que não se encaixem nos ICP_SEGMENTS).

REGRA 4 (ANTI-INFLUENCER): Se o perfil tiver mais de 30.000 seguidores, rejeite (Score 0 e is_icp=false). Estes perfis vivem de parcerias, não são compradores.

REGRA 5 (ANTI-CONCORRENTE - WHITE-LABEL): Analise a Bio, o Link da Bio e as Legendas dos Posts Recentes. Se o perfil for um concorrente, revendedor, loja, ou atuar no mesmo modelo de negócio da empresa (${companyName} - ${revenueModel}), rejeite (Score 0). Se o perfil postar conteúdo promocional, fotos em stands de feira ou divulgação de produtos para vender, rejeite.

Retorne APENAS um JSON válido no formato exato:
{
  "funnel": "A" | "B",
  "score": 0 a 100,
  "role": "dono" | "agronomo" | "piloto" | "outros",
  "is_icp": true | false,
  "reason": "explicação curta e objetiva baseada nos fatos"
}
    `.trim();

    const userPrompt = `
PACOTE DE CONTEXTO DO LEADS:
Handle: @${handle}
Categoria: ${category || 'Não informada'}
Bio: ${bio || 'Vazia'}
Link da Bio: ${bioLink || 'Nenhum'}
Seguidores: ${followers || 'Não informado'}
Legendas Recentes dos Posts: ${recentCaptions || 'Nenhuma'}
    `.trim();

    const aiResponseJson = await generateCompletion(systemAddition, userPrompt, 'FAST');

    if (!aiResponseJson) {
      console.error(`[CLASSIFY] Falha ao classificar lead ${handle}: resposta nula da IA`);
      return;
    }

    const cleanJsonStr = aiResponseJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJsonStr);

    const isQualified = (result.score >= 70) && (result.is_icp === true);
    let funnelType: string;
    let newPipelineStatus: string;

    if (isQualified) {
      funnelType = result.funnel === 'B' ? 'B_AFFILIATE' : 'A_CLIENT';
      newPipelineStatus = 'qualified';
    } else {
      funnelType = 'REJECTED';
      newPipelineStatus = 'closed';
    }

    sqlite.prepare(`
      UPDATE leads
      SET funnel_type = ?,
          pipeline_status = ?,
          score = ?,
          fit_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      funnelType,
      newPipelineStatus,
      result.score || 0,
      result.reason || 'Classificado pela IA Julgadora',
      leadId
    );

    if (isQualified) {
      console.log(`🎯 [CLASSIFY QUALIFIED] Lead @${handle} QUALIFICADO! Score: ${result.score} | Funil: ${funnelType} | Motivo: ${result.reason}`);
      // Enfileira geração da primeira DM para qualificados
      sqlite.prepare(`
        INSERT INTO jobs (type, payload, status, run_at)
        VALUES ('generate_first_dm', ?, 'pending', CURRENT_TIMESTAMP)
      `).run(JSON.stringify({ leadId, funnelType }));
    } else {
      console.log(`🚫 [CLASSIFY DISQUALIFIED] Lead @${handle} ENCERRADO (Closed). Score: ${result.score} | Motivo: ${result.reason}`);
    }
  } catch (error) {
    console.error(`❌ [CLASSIFY ERROR] Erro ao classificar lead ID ${leadId}:`, error);
    throw error;
  } finally {
    sqlite.close();
  }
}
