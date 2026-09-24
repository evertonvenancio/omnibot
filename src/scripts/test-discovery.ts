import Database from 'better-sqlite3';
import { chromium, Locator } from 'playwright';

const dbPath = 'data/sqlite.db';

async function safeText(locator: Locator): Promise<string> {
  try {
    const text = await locator.textContent({ timeout: 2000 });
    return (text || '').trim();
  } catch (e) {
    return '';
  }
}

async function runDiscovery() {
  const db = new Database(dbPath);

  // 1. Get Keywords - usa a SEGUNDA hashtag para variar
  const settings = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ICP_KEYWORDS') as { value: string };
  const keywords = settings.value.split(' ').filter(k => k.startsWith('#'));
  const targetHashtag = (keywords[1] || keywords[0] || 'agro').replace('#', '');

  console.log(`[DISCOVERY] Hashtag selecionada: #${targetHashtag} (índice ${keywords[1] ? 1 : 0} de ${keywords.length})`);

  // 2. Connect to Chrome
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Limpeza do Banco de Dados
  console.log('[DISCOVERY] Limpando tabelas de trabalho...');
  db.exec('DELETE FROM jobs;');
  db.exec('DELETE FROM leads;');
  db.exec('DELETE FROM messages;');
  db.exec('DELETE FROM ai_calls;');

  await page.goto(`https://www.instagram.com/explore/tags/${targetHashtag}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('article, main', { timeout: 15000 }).catch(() => {});

  // 3. Coletar 15 links de posts (suportando /p/, /reel/, /reels/)
  const postHrefs: string[] = [];
  const seenHrefs = new Set<string>();

  let scrollAttempts = 0;
  while (postHrefs.length < 15 && scrollAttempts < 8) {
    const anchors = await page.locator('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]').all();
    for (const a of anchors) {
      const href = await a.getAttribute('href').catch(() => null);
      if (href && !seenHrefs.has(href)) {
        seenHrefs.add(href);
        postHrefs.push(href);
        if (postHrefs.length >= 15) break;
      }
    }
    if (postHrefs.length < 15) {
      console.log(`[DISCOVERY] Encontrados ${postHrefs.length}/15 links. Rolando... (tentativa ${scrollAttempts + 1})`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      scrollAttempts++;
    }
  }

  console.log(`[DISCOVERY] Total de ${postHrefs.length} posts/reels coletados para prospecção.`);

  const usernamesAndBios = new Map<string, string>();

  // 4. Loop Direto nos posts (sem modal)
  for (let i = 0; i < postHrefs.length; i++) {
    if (page.isClosed()) {
      console.log(`[DISCOVERY] Página fechada, encerrando loop.`);
      break;
    }

    const postHref = postHrefs[i];
    let cleanUsername = '';
    try {
      const postUrl = postHref.startsWith('http')
        ? postHref
        : `https://www.instagram.com${postHref}`;

      await page.goto(postUrl, { timeout: 15000 });
      // Tenta aguardar header ou main/section genérica de posts/reels
      await page.waitForSelector('header, article, main', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      if (page.isClosed()) break;

      // Extrai @username via varredura de âncoras na header/article/main com validação estrita
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
        console.log(`[DISCOVERY] Post ${i + 1} (${postHref}): nenhum handle de perfil válido encontrado, pulando.`);
        continue;
      }

      // Navega para o perfil
      await page.goto(`https://www.instagram.com/${cleanUsername}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);

      if (page.isClosed()) break;

      // Extrai bio com seletores em cascata rigorosos
      let bio = await safeText(page.locator('header section div span').first());
      if (!bio) bio = await safeText(page.locator('header section > div').nth(2).locator('span').first());
      if (!bio) bio = await safeText(page.locator('header section div').last());
      if (!bio) bio = await safeText(page.locator('section main div ul + div span').first());

      if (!bio) {
        console.log(`[DISCOVERY] Perfil ${cleanUsername} sem bio visível, pulando.`);
        continue;
      }

      usernamesAndBios.set(cleanUsername, bio);
      console.log(`[DISCOVERY] Perfil ${i + 1}/15 coletado: ${cleanUsername} | Bio: ${bio.substring(0, 40)}...`);
    } catch (e) {
      console.warn(`[DISCOVERY] Falha ao processar post ${i + 1} (${postHref}): ${e}`);
    }
  }

  // 5. Save and Enqueue
  let savedCount = 0;
  for (const [username, bio] of Array.from(usernamesAndBios.entries())) {
    if (!username.trim() || !bio.trim()) continue;

    const existing = db.prepare('SELECT id FROM leads WHERE instagram_handle = ?').get(username);
    if (!existing) {
      console.log(`[DISCOVERY] Novo lead encontrado: ${username}`);
      const info = db.prepare(`
        INSERT INTO leads (instagram_handle, bio, funnel_type, pipeline_status, channel_status)
        VALUES (?, ?, 'A_CLIENT', 'discovered', 'browser_contact_pending')
      `).run(username, bio);

      db.prepare(`
        INSERT INTO jobs (type, payload, status, run_at)
        VALUES ('ai_classify', ?, 'pending', CURRENT_TIMESTAMP)
      `).run(JSON.stringify({ leadId: info.lastInsertRowid }));
      savedCount++;
    }
  }

  console.log(`[DISCOVERY] ${savedCount} novos leads salvos.`);

  if (!page.isClosed()) {
    await browser.close().catch(() => {});
  }
  db.close();
  console.log(`[DISCOVERY] Radar de prospecção concluído com sucesso.`);
}

runDiscovery().catch(console.error);
