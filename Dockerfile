# Stage 1: Build
FROM node:20-slim AS builder

# Install build dependencies (node-pty might need python/make/g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Vite frontend and compile TS server
RUN npm run build
RUN npx tsc server.ts --outDir dist --esModuleInterop --skipLibCheck --resolveJsonModule || true
# In case tsc server.ts fails due to config, fallback to default tsc with outDir override
RUN [ -f dist/server.js ] || npx tsc --outDir dist --noEmit false || true

# Stage 2: Runtime
FROM node:20-slim

# Install runtime dependencies: tmux and python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create nexterm user and set permissions
RUN useradd -m -s /bin/bash nexterm \
    && chown -R nexterm:nexterm /app

COPY --from=builder --chown=nexterm:nexterm /app/dist ./dist
COPY --from=builder --chown=nexterm:nexterm /app/node_modules ./node_modules
COPY --from=builder --chown=nexterm:nexterm /app/package*.json ./
COPY --from=builder --chown=nexterm:nexterm /app/.env* ./

# Support memory sessions persistence 
RUN mkdir -p ./sessions && chown -R nexterm:nexterm ./sessions

# Ensure nexterm user owns everything in /app
RUN chown -R nexterm:nexterm /app

USER nexterm

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
