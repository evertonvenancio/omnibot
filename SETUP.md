# SETUP — Manual do Operador Nexus SDR

Bem-vindo ao Nexus SDR. Este documento é o guia oficial para colocar o sistema em funcionamento na sua máquina.

---

## 1. Pré-requisitos

- **Node.js 24 LTS** (ou superior) instalado.
- **pnpm** ou **npm** (exemplos abaixo usarão npm para compatibilidade universal).
- Google Chrome instalado (para o módulo Playwright/CDP).

---

## 2. Instalação das Dependências

Clone o projeto (caso ainda não tenha) e instale os pacotes:

```bash
npm install
```

Em seguida, popule o banco de dados SQLite. Esse comando lê o `config/business.json` (Seed) e cria as tabelas.

```bash
npx tsx init-db.ts
```

---

## 3. Configuração de Segredos (.env)

Copie o arquivo de exemplo e preencha com suas chaves reais:

```bash
cp .env.example .env
```

Edite o `.env`:

### 3.1 Chave da OpenAI (9Router)
Acesse https://platform.openai.com/api-keys e:
1. Crie um **projeto separado** para o Nexus SDR.
2. Dê permissão **Restricted** (não Admin).
3. Em **Settings → Limits**, defina um **hard limit mensal** em USD (ex: $50).

### 3.2 Credenciais da Meta (Instagram Graph API)
1. Acesse o [Meta Developer Portal](https://developers.facebook.com/).
2. Configure um App do tipo "Business" e adicione o produto **Instagram Graph API**.
3. Gere um **Long-Lived Page Access Token**.
4. Defina um `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (uma string aleatória forte).

---

## 4. Subindo o Chrome com Debug Remoto (Playwright)

⚠️ **ATENÇÃO DE SEGURANÇA**: A porta de debug dá controle total sobre a sessão logada do Chrome. Mantenha em `127.0.0.1`, **nunca** em `0.0.0.0`, e nunca em máquinas compartilhadas.

### 4.1 macOS
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=$HOME/.chrome-nexus-profile \
  --no-first-run
```

### 4.2 Linux
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=$HOME/.chrome-nexus-profile \
  --no-first-run
```

### 4.3 Windows (PowerShell)
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --remote-debugging-address=127.0.0.1 `
  --user-data-dir="$env:USERPROFILE\.chrome-nexus-profile" `
  --no-first-run
```

### 4.4 Login no Instagram
Com o Chrome aberto nessa instância, **acesse instagram.com e faça login manualmente uma única vez**. O Nexus SDR reusará essa sessão.

---

## 5. Configurando o Webhook na Meta (Túnel Reverso)

O webhook da Meta precisa alcançar seu servidor Next.js local. Como o seu IP residencial tem NAT, use um túnel reverso.

### 5.1 Ngrok (Mais simples)
```bash
ngrok http 3000
```
Copie a URL `https://xxxx.ngrok-free.app` gerada e cadastre-a no Meta Developer Portal:
- **Callback URL**: `https://xxxx.ngrok-free.app/api/webhooks/instagram`
- **Verify Token**: o mesmo que você definiu em `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.

### 5.2 Cloudflare Tunnel (Mais estável)
```bash
cloudflared tunnel --url http://localhost:3000
```

---

## 6. Rodando o Sistema

Em **um terminal**, suba o painel Next.js:
```bash
npm run dev
```
Acesse: http://localhost:3000

Em **outro terminal**, suba o Worker (fila de jobs no SQLite):
```bash
npm run worker
```

---

## 7. Backup e Restauração do SQLite

### Backup Automático (Windows PowerShell)
```powershell
Copy-Item data\sqlite.db backups\sqlite-$(Get-Date -Format "yyyyMMdd-HHmmss").db
```

### Backup Automático (Linux/macOS)
```bash
cp data/sqlite.db backups/sqlite-$(date +%Y%m%d-%H%M%S).db
```

### Restauração
Pare o worker e o painel. Substitua `data/sqlite.db` pelo backup e reinicie os serviços.

---

## 8. O que fazer se a chave OpenAI vazar

1. Revogue imediatamente a chave em https://platform.openai.com/api-keys.
2. Gere uma nova chave.
3. Atualize o `.env` e reinicie o worker (a chave é lida do processo em memória).

---

## 9. Pausando o Sistema

Acesse http://localhost:3000 e clique no botão **Pausar Sistema** no topo do Dashboard. O Worker detectará o flag `SYSTEM_PAUSED` no banco e parará de processar jobs imediatamente.

---

## 10. Suporte

Em caso de dúvidas ou problemas, consulte a aba **Exceções** no painel para identificar leads e jobs que precisam de intervenção manual.
