---
name: migracao-whatsapp-evolution
description: Relatório da migração do WhatsApp (Playwright/CDP para Evolution API) e configuração de IA dedicada.
metadata:
  type: project
---

[[whatsappWorker]] [[evolution]] [[openai]]
**Why:** A migração substitui a automação frágil do Playwright/CDP pela API estável da Evolution API e isola as credenciais de IA do WhatsApp das do Instagram.
**How to apply:** Manter `src/integrations/evolution/index.ts` e utilizar as variáveis de ambiente dedicadas (`OPENAI_API_KEY_WHATSAPP`, `EVOLUTION_API_URL`, etc.).
