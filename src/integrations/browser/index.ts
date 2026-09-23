import { chromium, BrowserContext, Page, Route } from 'playwright';
import { Mutex } from 'async-mutex';

interface MockBrowserContext {
  pages: any[];
  newPage(): Promise<MockPage>;
  close(): Promise<void>;
}

interface MockPage {
  url(): string;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  type(_selector: string, text: string, opts?: { delay?: number }): Promise<void>;
  locator(selector: string): { pressSequentially(text: string, opts?: { delay?: number }): Promise<void> };
  click(_selector: string): Promise<void>;
  goto(url: string): Promise<void>;
  close(): Promise<void>;
  on(_event: string, _listener: (...args: any[]) => void): void;
}

export const browserMutex = new Mutex();

let browserInstance: BrowserContext | MockBrowserContext | null = null;

export async function getBrowserContext(): Promise<BrowserContext | MockBrowserContext | null> {
  if (browserInstance) {
    return browserInstance;
  }

  const isDryRun = process.env.DRY_RUN === 'true' || !process.env.CHROME_CDP_URL;

  if (isDryRun) {
    console.log('🛡️ [BROWSER] DRY_RUN=true detectado. Usando Mock Browser em vez de CDP real.');
    browserInstance = createMockBrowser();
    return browserInstance;
  }

  try {
    const cdpUrl = process.env.CHROME_CDP_URL;
    if (!cdpUrl) {
      console.error('❌ [BROWSER] CHROME_CDP_URL não definida no .env');
      return null;
    }
    console.log(`🔌 [BROWSER] Conectando ao Chrome via CDP em ${cdpUrl}...`);
    const browser = await chromium.connectOverCDP(cdpUrl);

    // Reusa o contexto logado
    const context = browser.contexts()[0];
    if (!context) {
      console.error('❌ [BROWSER] Nenhum contexto logado encontrado.');
      browserInstance = null;
      return null;
    }
    browserInstance = context;
    return context;
  } catch (error) {
    console.error('❌ [BROWSER] Falha ao conectar via CDP:', error);
    return null;
  }
}

export async function createAgentPage(context: BrowserContext | MockBrowserContext): Promise<Page | MockPage> {
  const page = await (context as BrowserContext).newPage();

  // Se for Page real do Playwright, aplica restrição de domínio
  if ('route' in page) {
    await (page as Page).route('**/*', (route: Route) => {
      const url = route.request().url();
      if (url.includes('instagram.com') || url.startsWith('data:') || url.startsWith('about:')) {
        route.continue();
      } else {
        console.warn(`🚫 [BROWSER] Bloqueando acesso fora do domínio instagram.com: ${url}`);
        route.abort();
      }
    });
  }

  return page;
}

// --- MOCK BROWSER (Para Sandbox / DRY_RUN) ---
function createMockBrowser(): MockBrowserContext {
  return {
    pages: [],
    async newPage(): Promise<MockPage> {
      const page = createMockPage();
      this.pages.push(page);
      return page;
    },
    async close() {
      this.pages = [];
    }
  };
}

function createMockPage(): MockPage {
  return {
    url() { return 'https://www.instagram.com/direct/inbox/'; },
    async setViewportSize() { /* no-op */ },
    async type(_selector, text, opts) {
      console.log(`⌨️ [MOCK PAGE] Digitando (delay ${opts?.delay || 50}ms por char): "${text}"`);
      await new Promise(r => setTimeout(r, Math.min(100, (text.length * (opts?.delay || 50)))));
    },
    locator(_selector: string) {
      return {
        async pressSequentially(text: string, opts?: { delay?: number }) {
          console.log(`⌨️ [MOCK PAGE] Digitando (delay ${opts?.delay || 50}ms por char): "${text}"`);
          await new Promise(r => setTimeout(r, Math.min(100, (text.length * (opts?.delay || 50)))));
        }
      };
    },
    async click(_selector) {
      console.log(`🖱️ [MOCK PAGE] Clicando no elemento`);
      await new Promise(r => setTimeout(r, 100));
    },
    async goto(url) {
      console.log(`🌐 [MOCK PAGE] Navegando para: ${url}`);
    },
    async close() {
      console.log(`🪟 [MOCK PAGE] Aba do agente fechada (try/finally).`);
    },
    async on() { /* no-op */ }
  };
}
