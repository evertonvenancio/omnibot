# SETUP — Manual do Operador OmniBot

Bem-vindo ao OmniBot. Este documento é o guia oficial para colocar o sistema em funcionamento na sua máquina.

---

## 1. Pré-requisitos

- **Node.js 24 LTS** (ou superior) instalado.
- **pnpm** ou **npm** (exemplos abaixo usarão npm para compatibilidade universal).
- Google Chrome instalado (para o módulo Playwright/CDP).

---

## 2. Instalação das Dependências

Clone o projeto e instale os pacotes:

```bash
npm install
```

Em seguida, popule o banco de dados SQLite. Esse comando lê o `config/business.json` (Seed) e cria as tabelas iniciais:

```bash
npm run db:seed
```

---

## 3. Configuração de Segredos (.env)

Copie o arquivo de exemplo e preencha com suas chaves reais:

```bash
cp .env.example .env
```

Edite o `.env`:

### 3.1 Chave da OpenAI (9Router / Direct)
1. Crie uma chave de API na OpenAI / provedor configurado.
2. Defina `OPENAI_API_KEY` e a URL base no `.env`.

### 3.2 Credenciais da Meta (Instagram Graph API)
1. Acesse o [Meta Developer Portal](https://developers.facebook.com/).
2. Configure um App do tipo "Business" e adicione o produto **Instagram Graph API**.
3. Gere um **Long-Lived Page Access Token**.
4. Defina o `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (uma string aleatória forte).

---

## 4. Subindo o Chrome com Debug Remoto (Playwright / Instagram)

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
Com o Chrome aberto nessa instância, **acesse instagram.com e faça login manualmente uma única vez**. O sistema reusará essa sessão.

---

## 5. Configurando o Webhook 



O webhook da Meta precisa alcançar seu servidor Next.js local.

### 5.1 Ngrok
```bash
ngrok http 3000
```
Cadastre a URL no Meta Developer Portal:
- **Callback URL**: `https://xxxx.ngrok-free.app/api/webhooks/instagram`
- **Verify Token**: o mesmo que você definiu em `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.

---

## 6. Módulo do WhatsApp (/whatsapp)


O módulo do WhatsApp permite gerenciar campanhas de disparo ativo e prospecção em massa.

### 6.1 Funcionalidades do Módulo
- **Upload de Bases**: Suporte a arquivos `.csv` e `.xlsx` com contatos.
- **Janela e Limites de Envio**: Definição de horário de início, horário de término e intervalo de contatos mínimos/máximos por dia.
- **Dias de Operação**: Seleção dos dias da semana em que as campanhas devem rodar.
- **Humanização por IA**: Ajuste da porcentagem de perfil de envio (Natural, Moderação e Devagar, totalizando 100%) para simular comportamento humano nos disparos.
- **Templates de Mensagem**: Edição de templates dinâmicos processados por IA.
- **Teste de Envio**: Campo para validação prévia de mensagens direto para um número de teste.
- **Relatórios CSV**: Exportação dos logs de contatos e status de entrega/falha.

### 6.2 Pausa e Retomada Independente do WhatsApp
O WhatsApp possui controle próprio de estado armazenado no banco (`SYSTEM_PAUSED_WHATSAPP`):
- Na tela `/whatsapp`, clique em **Pausar** ou **Retomar** no cabeçalho.
- O botão reflete o estado atual com cores (verde para ativo, laranja para pausado).
- O indicador (*dot*) no card do WhatsApp no Dashboard (`/`) reflete instantaneamente se o envio do WhatsApp está ativo ou pausado, sem afetar o Instagram.

---

## 7. Rodando o Sistema

Em **um terminal**, suba o painel Next.js:
```bash
npm run dev
```
Acesse: http://localhost:3000

Em **outro terminal**, suba o Worker (processador de filas e jobs do sistema):
```bash
npm run worker
```

---

## 8. Backup e Restauração do SQLite

### Backup Automático (Windows PowerShell)
```powershell
Copy-Item data\sqlite.db backups\sqlite-$(Get-Date -Format "yyyyMMdd-HHmmss").db
```

### Backup Automático (Linux/macOS)
```bash
cp data/sqlite.db backups/sqlite-$(date +%Y%m%d-%H%M%S).db
```

### Restauração
Pare o worker e o painel. Substitua `data/sqlite.db` pelo arquivo de backup e reinicie os serviços.

---

## 9. O que fazer se a chave OpenAI vazar

1. Revogue imediatamente a chave no painel do seu provedor.
2. Gere uma nova chave.
3. Atualize o `.env` e reinicie o worker.

---

## 10. Pausando e Retomando o Sistema

O sistema possui controles de pausa independentes para cada canal:
- **Instagram**: Controlado pelo botão em `/leads` (persistido via `SYSTEM_PAUSED_INSTAGRAM`).
- **WhatsApp**: Controlado pelo botão em `/whatsapp` (persistido via `SYSTEM_PAUSED_WHATSAPP`).

Ambos os status são exibidos lado a lado no Dashboard (`/`) através de indicadores coloridos nos cards de cada canal.

---

## 11. Suporte

Em caso de exceções ou falhas em disparos/jobs, consulte a aba **Exceções** (`/exceptions`) no painel para re-enfileirar jobs ou reativar leads que demandam intervenção manual.
