# OmniBot (IA & Automação de Vendas)


OmniBot is an advanced, AI-powered Sales Development Representative (SDR) and lead qualification platform designed for automated outreach, lead management, and multi-channel engagement via **Instagram DMs** and **WhatsApp campaigns**.

## 🚀 Key Features

- **Dashboard (`/`)**: Real-time metrics, total sales tracking, and funnels for both direct clients and affiliate partners with elastic layout rendering. Separate status indicator dots for Instagram and WhatsApp pause states.
- **Leads & Drill-Downs (`/leads`)**: Comprehensive pipeline management across stages (`qualified`, `closed`, `contacted`, `responded`, `interested`, `forwarded_whatsapp`, `forwarded_group`, etc.) with drill-down screens.
- **WhatsApp Campaigns (`/whatsapp`)**:
  - Contact list uploads (`.csv`, `.xlsx`).
  - Customizable operating hours, min/max daily contacts, and operating days.
  - AI Humanization profiles (Natural, Moderated, Slow percentages).
  - Message templates with AI generation.
  - Independent Pause/Resume controls (`SYSTEM_PAUSED_WHATSAPP`) syncing with the dashboard.
  - Real-time sending logs and CSV report export.
- **Settings (`/settings`)**: Business pitch, rules, ICP definitions, and operational limits.
- **Exception Management (`/exceptions`)**: Handling dead-letter jobs and leads flagged for human review or API window closures.

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router, Server Actions, `force-dynamic`)
- **Database**: SQLite with `better-sqlite3` and Drizzle ORM
- **Styling**: Tailwind CSS
- **Automation / Browser Integration**: Playwright (Chrome DevTools Protocol for Instagram DM automation)
- **Language**: TypeScript

## 📦 Quick Start

For detailed installation and operator setup instructions, please refer to [SETUP.md](./SETUP.md).

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Set up environment variables (`.env`).
3. Initialize the database:
   ```bash
   npx tsx src/scripts/init-db.ts
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## 📄 License

Private / Internal Project.
