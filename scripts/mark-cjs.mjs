#!/usr/bin/env node
// Post-build: mark dist/server/ as CommonJS so Node.js doesn't
// try to interpret compiled .js files as ESM (which requires .js extensions).
// This overrides the root package.json's "type": "module" for this subdirectory.
import { writeFileSync } from 'fs';
writeFileSync('dist/server/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log('  ✓ dist/server/package.json written (type: commonjs)');
