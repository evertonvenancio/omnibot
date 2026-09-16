FROM node:20-slim

# Instalar dependências do sistema para better-sqlite3 e Playwright
RUN apt-get update && apt-get install -y python3 make g++ libc6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package.json, pnpm-lock.yaml e .npmrc
COPY package.json pnpm-lock.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile

# Copiar o resto do código
COPY . .

# Build do Next.js
RUN pnpm run build

# Expor a porta do Next.js
EXPOSE 3000

# Comando padrão (pode ser sobrescrito no docker-compose)
CMD ["pnpm", "start"]
