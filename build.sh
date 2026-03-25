#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting NexTerm build process..."

echo "1/3: Installing dependencies..."
npm install

echo "2/3: Compiling server (TypeScript) to dist/..."
# Attempt to compile exactly server.ts, fallback to tsconfig.json with outDir
npx tsc server.ts --outDir dist --esModuleInterop --skipLibCheck --resolveJsonModule || npx tsc --outDir dist --noEmit false

echo "3/3: Building frontend (Vite) to dist/..."
npm run build

echo ""
echo "Build complete successfully!"
echo "You can now run the server with: node dist/server.js"
