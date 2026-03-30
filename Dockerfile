# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# node-pty needs python3/make/g++ to compile its native bindings
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Compile server TypeScript → dist/server/
RUN npm run build:server

# Bundle frontend → dist/ (Vite)
RUN npm run build:client

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

# bash is the shell NexTerm will spawn for each terminal session
RUN apk add --no-cache bash

WORKDIR /app

# Non-root user for security
RUN addgroup -S nexterm && adduser -S -G nexterm -s /bin/bash nexterm \
    && chown -R nexterm:nexterm /app

# Install ONLY production deps — skips Vite, tsx, TypeScript, React source, etc.
COPY --chown=nexterm:nexterm package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder --chown=nexterm:nexterm /app/dist ./dist

USER nexterm

EXPOSE 3000

ENV NODE_ENV=production \
    NEXTERM_SHELL=/bin/bash

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/server.js"]
