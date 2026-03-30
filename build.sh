#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting NexTerm build process..."

echo "1/3: Installing dependencies..."
npm ci

echo "2/3: Compiling server (TypeScript) → dist/server/..."
npm run build:server

echo "3/3: Building frontend (Vite) → dist/..."
npm run build:client

echo ""
echo "Build complete!"
echo "  Server: dist/server/server.js"
echo "  Client: dist/ (static files)"
echo ""
echo "Run with: node dist/server/server.js"
echo "Or via PM2: pm2 start ecosystem.config.js"
