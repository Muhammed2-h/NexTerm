import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import type { ChildProcess } from 'child_process';
import path from 'path';
import cors from 'cors';

import 'dotenv/config'; // Enable process.env parsing from .env
import crypto from 'crypto';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { z } from 'zod';
// Setup basic audit logging
const logger = pino ? pino({ level: 'info' }) : (console as any);

// VULN 2 FIX: Terminal running as root
if (process.getuid && process.getuid() === 0) {
  if (!process.argv.includes('--allow-root')) {
    logger.error('CRITICAL WARNING: Running terminal as root is extremely dangerous!');
    logger.error(
      'Please restart the application as a non-root user, or pass --allow-root to bypass this check.',
    );
    process.exit(1);
  }
  logger.warn('WARNING: Running as root (--allow-root provided). This is a severe security risk.');
}

// VULN 1 FIX: Setup Secret Token for Auth
let SECRET_TOKEN = process.env.SECRET_TOKEN as string;
if (!SECRET_TOKEN) {
  SECRET_TOKEN = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(process.cwd(), '.env.local');
  fs.appendFileSync(envPath, `\nSECRET_TOKEN=${SECRET_TOKEN}\n`);
  logger.info(`[SECURITY] Generated new SECRET_TOKEN and saved to .env.local: ${SECRET_TOKEN}`);
}

const PORT = 3000;

import { SessionManager } from './src/sessionManager';
import { createApiRouter } from './src/routes/api';

const sessionManager = new SessionManager(logger);

async function startServer() {
  const app = express();

  const isDev = process.env.NODE_ENV !== 'production';

  // Security Headers — strict in production, relaxed in dev (Vite needs inline scripts + HMR WS)
  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? false // Disable CSP entirely in dev — Vite handles it via its dev server
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              connectSrc: ["'self'", 'ws:', 'wss:'],
              styleSrc: ["'self'", "'unsafe-inline'"], // xterm.js needs inline styles
            },
          },
    }),
  );

  // VULN 3 FIX: Replace open CORS
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    }),
  );
  app.use(express.json());

  // VULN 5 FIX: API Rate Limiter
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 100, message: 'Too many requests' });
  app.use('/api', apiLimiter);

  // VULN 1 FIX: Protect API routes
  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${SECRET_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // API routes
  app.use('/api', createApiRouter(sessionManager, logger));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket Server for Terminal
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });
  const wsConnections = new Map<string, number>();

  const ConnectMsg = z.object({ type: z.literal('connect'), sessionId: z.string().optional() });
  const DataMsg = z.object({ type: z.literal('data'), payload: z.string() });
  const ResizeMsg = z.object({
    type: z.literal('resize'),
    payload: z.object({ cols: z.number(), rows: z.number() }),
  });
  const IncomingMsg = z.discriminatedUnion('type', [ConnectMsg, DataMsg, ResizeMsg]);

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || 'unknown';

    // VULN 1 FIX part 2: Protect WS connection with Token param
    try {
      const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
      const token = urlObj.searchParams.get('token');
      if (token !== SECRET_TOKEN) {
        ws.close(1008, 'Unauthorized');
        return;
      }
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // VULN 5 FIX: WS rate limiting per IP
    const count = wsConnections.get(ip) || 0;
    if (count >= 5) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }
    wsConnections.set(ip, count + 1);

    logger.info({ ip }, 'Authorized WebSocket connection established');



    let ptyProcess: ChildProcess | null = null;
    let currentSessionId: string | null = null;
    let bytesReceived = 0;

    // VULN 5 FIX part 3: Rate limit WS data messages by byte
    const bytesInterval = setInterval(() => {
      bytesReceived = 0;
    }, 1000);

    ws.on('message', (message) => {
      const msgBuffer = message as Buffer;
      // VULN 8 FIX: Message size limit (64KB max)
      if (msgBuffer.length > 65536) {
        ws.close(1009, 'Message too large');
        return;
      }

      bytesReceived += msgBuffer.length;
      if (bytesReceived > 10000) {
        logger.warn({ ip, sessionId: currentSessionId }, 'Rate limit exceeded on WS connection');
        ws.close(1009, 'Rate limit exceeded');
        return;
      }

      try {
        const rawData = JSON.parse(message.toString());
        const parsed = IncomingMsg.safeParse(rawData);

        if (!parsed.success) {
          logger.error({ error: parsed.error }, 'Invalid WS message payload');
          return;
        }

        const data = parsed.data;

        if (data.type === 'connect') {
          // VULN 4 FIX: Support resuming previous verified uuid, else generated securely on server
          let sessionId = data.sessionId;

          if (
            !sessionId ||
            (!sessionManager.hasMemorySession(sessionId) &&
              !sessionManager.hasTmuxSession(sessionId))
          ) {
            sessionId = crypto.randomUUID();
          }

          currentSessionId = sessionId;

          // VULN 10 FIX: Audit Logging
          logger.info({ ip, sessionId }, 'User spawned terminal shell');

          ptyProcess = sessionManager.getOrCreateSession(sessionId, ws);
          // Acknowledge back with the determined session ID
          ws.send(JSON.stringify({ type: 'session_id', payload: sessionId }));
        } else if (data.type === 'data') {
          ptyProcess?.stdin?.write(Buffer.from(data.payload, 'base64'));
        } else if (data.type === 'resize') {
          ptyProcess?.stdin?.write(`stty cols ${data.payload.cols} rows ${data.payload.rows}\n`);
        }
      } catch (e) {
        logger.error({ err: e }, 'WS message error');
      }
    });

    ws.on('close', () => {
      wsConnections.set(ip, Math.max(0, (wsConnections.get(ip) || 1) - 1));
      clearInterval(bytesInterval);
      if (currentSessionId) {
        const isMemory = sessionManager.hasMemorySession(currentSessionId);
        if (!isMemory && ptyProcess) {
          ptyProcess.kill();
        }
      }
    });
  });
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
