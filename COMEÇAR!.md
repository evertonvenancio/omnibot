💻 1. NO SEU COMPUTADOR LOCAL (Windows)



* Abrir o Chrome IG



\& "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\Projetos\\OmniBot\\.chrome-profile"



* Rodar o Sistema Localmente (PowerShell NORMAL, dentro da pasta C:\\Projetos\\OmniBot):



Terminal 1

pnpm dev



Terminal 2

pnpm run worker



* Limpar o Banco de Dados Local (PowerShell NORMAL, dentro da pasta C:\\Projetos\\OmniBot):



node -e "const db = require('better-sqlite3')('data/sqlite.db'); db.exec('DELETE FROM messages; DELETE FROM ai\_calls; DELETE FROM jobs; DELETE FROM leads;'); console.log('Banco local limpo com sucesso');"



🌩️ 2. NA VPS (Acesso via SSH)



* No PowerShell do Windows, digite para entrar na VPS.

&#x09;

ssh root@2.25.224.246



* Testar se a VPS enxerga o seu Chrome (O Teste de Ouro):



curl http://100.118.99.10:9222/json/version



* Atualizar o Sistema na VPS (Puxar do GitHub e Rebuildar Docker):



cd /opt/omnibot

git pull origin main

docker compose up -d --build



* Reiniciar apenas o Worker (sem rebuildar):



docker restart omnibot-worker



* Limpar o Banco de Dados na VPS (Apagar Leads e Jobs presos):



docker exec omnibot-app node -e "const db = require('better-sqlite3')('data/sqlite.db'); db.exec('DELETE FROM messages; DELETE FROM ai\_calls; DELETE FROM jobs; DELETE FROM leads;'); console.log('Banco da VPS limpo com sucesso');"



* Ver os Logs do Worker em tempo real:



docker logs omnibot-worker --tail 30 --follow



(Para sair dos logs, aperte Ctrl + C)

