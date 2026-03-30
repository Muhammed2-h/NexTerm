# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Install build-time native deps (node-pty needs python3/make/g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including devDeps) for the build step
RUN npm ci

COPY . .

# 1) Compile server TypeScript → dist/server/
RUN npm run build:server

# 2) Bundle frontend → dist/  (Vite)
RUN npm run build:client

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim

# Runtime system deps: tmux for shell sessions
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user
RUN useradd -m -s /bin/bash nexterm \
    && chown -R nexterm:nexterm /app

# Copy only what's needed to run at runtime:
#   - compiled server JS
#   - bundled static frontend
#   - production node_modules (no Vite/tsx/TypeScript)
COPY --from=builder --chown=nexterm:nexterm /app/dist ./dist
COPY --from=builder --chown=nexterm:nexterm /app/package*.json ./

# Install ONLY production deps — skips Vite, tsx, TypeScript, React source, etc.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=nexterm:nexterm /app/.env* ./

# Persistent session storage dir
RUN mkdir -p ./sessions && chown -R nexterm:nexterm ./sessions

USER nexterm

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/server.js"]
