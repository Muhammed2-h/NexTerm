import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { z } from 'zod';

// Load .env first, then .env.local overrides (must run before any process.env reads)
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// ── Root-user guard ───────────────────────────────────────────────────────────
if (process.getuid && process.getuid() === 0) {
  if (!process.argv.includes('--allow-root')) {
    logger.error('Running as root is dangerous. Restart as a non-root user or pass --allow-root.');
    process.exit(1);
  }
  logger.warn('Running as root (--allow-root). This is a severe security risk.');
}

// ── Secret token ──────────────────────────────────────────────────────────────
// Auto-generated on first run if not set in .env.local
let SECRET_TOKEN = process.env.SECRET_TOKEN ?? '';
if (!SECRET_TOKEN) {
  SECRET_TOKEN = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(process.cwd(), '.env.local');
  fs.appendFileSync(envPath, `\nSECRET_TOKEN=${SECRET_TOKEN}\n`);
  logger.info(`[SECURITY] Generated SECRET_TOKEN, saved to .env.local (prefix: ${SECRET_TOKEN.slice(0, 8)}...)`);
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

import { SessionManager } from './src/sessionManager';
import { createApiRouter } from './src/routes/api';

const sessionManager = new SessionManager(logger);

// ── WS message schemas ────────────────────────────────────────────────────────
// Defined at module scope so they're shared across connections without re-creation
const ConnectMsg = z.object({ type: z.literal('connect'), sessionId: z.string().optional() });
const DataMsg = z.object({ type: z.literal('data'), payload: z.string() });
const ResizeMsg = z.object({
  type: z.literal('resize'),
  payload: z.object({ cols: z.number(), rows: z.number() }),
});
const IncomingMsg = z.discriminatedUnion('type', [ConnectMsg, DataMsg, ResizeMsg]);

async function startServer() {
  const app = express();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          styleSrc: ["'self'", "'unsafe-inline'"], // xterm.js needs inline styles
        },
      },
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'];
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  // ── Rate limiting ─────────────────────────────────────────────────────────
  // General API limiter applies to all /api/* routes
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 100, message: 'Too many requests' });
  // Stricter limiter applied additionally to the login endpoint
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Too many login attempts' });
  app.use('/api', apiLimiter);

  // ── Auth config ────────────────────────────────────────────────────────────
  // Set NEXTERM_USER and NEXTERM_PASSWORD in .env.local to enable the login gate.
  // If either is unset the terminal is open to anyone who can reach the server.
  const AUTH_USER = process.env.NEXTERM_USER?.trim() ?? '';
  const AUTH_PASS = process.env.NEXTERM_PASSWORD?.trim() ?? '';
  const AUTH_REQUIRED = AUTH_USER !== '' && AUTH_PASS !== '';

  logger.info(AUTH_REQUIRED ? '[AUTH] Password protection enabled' : '[AUTH] No credentials set — terminal is open');

  // ── Public auth endpoints (no Bearer check) ───────────────────────────────

  // Tells the frontend whether to show the login screen
  app.get('/api/auth-required', (_req, res) => {
    res.json({ required: AUTH_REQUIRED });
  });

  // Validate credentials → return the WS auth token
  app.post('/api/login', loginLimiter, (req, res) => {
    if (!AUTH_REQUIRED) {
      return res.json({ token: SECRET_TOKEN });
    }
    const { username, password } = req.body as { username?: string; password?: string };
    if (username === AUTH_USER && password === AUTH_PASS) {
      logger.info({ username }, '[AUTH] Login successful');
      return res.json({ token: SECRET_TOKEN });
    }
    logger.warn({ username }, '[AUTH] Login failed — wrong credentials');
    return res.status(401).json({ error: 'Invalid username or password' });
  });

  // Open token endpoint (only when auth is disabled; used by Terminal in open mode)
  app.get('/api/token', (_req, res) => {
    if (AUTH_REQUIRED) {
      return res.status(401).json({ error: 'Login required — use POST /api/login' });
    }
    res.json({ token: SECRET_TOKEN });
  });

  // ── Bearer-token guard for all remaining /api/* routes ────────────────────
  app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${SECRET_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  app.use('/api', createApiRouter(sessionManager, logger));

  // ── Static frontend ───────────────────────────────────────────────────────
  const distPath = path.resolve(process.cwd(), 'dist', 'client');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(503).send('Frontend not built. Run: npm run build:client');
    }
  });

  const HOST = process.env.HOST ?? '127.0.0.1';

  // ── Network Exposure Guard ────────────────────────────────────────────────
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !AUTH_REQUIRED) {
    if (process.env.ALLOW_UNAUTHENTICATED === 'true') {
      logger.warn('⚠️ [SECURITY DANGER] Terminal is exposed to the network WITHOUT password protection!');
    } else {
      logger.fatal('🚨 [SECURITY FATAL] Refusing to bind to network interface without password protection!');
      logger.fatal('You are trying to host NexTerm publicly (or on a LAN) without setting a username and password.');
      logger.fatal('Please set NEXTERM_USER and NEXTERM_PASSWORD in .env.local to secure the terminal.');
      logger.fatal('If you truly want an open terminal on the network, set ALLOW_UNAUTHENTICATED=true (HIGH RISK).');
      process.exit(1);
    }
  }

  const server = app.listen(PORT, HOST, () => {
    logger.info(`Server running on http://${HOST}:${PORT}`);
  });

  // ── WebSocket Server ──────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });

  // Track open connections per IP for rate limiting
  const wsConnections = new Map<string, number>();

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? 'unknown';

    // Authenticate via token query param
    try {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      if (url.searchParams.get('token') !== SECRET_TOKEN) {
        ws.close(1008, 'Unauthorized');
        return;
      }
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Per-IP connection cap
    const connCount = wsConnections.get(ip) ?? 0;
    if (connCount >= 5) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }
    wsConnections.set(ip, connCount + 1);

    logger.info({ ip }, 'Authorized WebSocket connection established');

    let currentSessionId: string | null = null;
    let bytesReceived = 0;

    // Reset byte counter every second (crude data-rate limiter)
    const bytesInterval = setInterval(() => {
      bytesReceived = 0;
    }, 1000);

    ws.on('message', (message) => {
      const msgBuffer = message as Buffer;

      // Hard 64 KB message size cap
      if (msgBuffer.length > 65_536) {
        ws.close(1009, 'Message too large');
        return;
      }

      bytesReceived += msgBuffer.length;
      if (bytesReceived > 10_000) {
        logger.warn({ ip, sessionId: currentSessionId }, 'WS data rate limit exceeded');
        ws.close(1009, 'Rate limit exceeded');
        return;
      }

      try {
        const parsed = IncomingMsg.safeParse(JSON.parse(msgBuffer.toString()));
        if (!parsed.success) {
          logger.warn({ error: parsed.error.flatten() }, 'Invalid WS message — ignored');
          return;
        }

        const msg = parsed.data;

        if (msg.type === 'connect') {
          currentSessionId = msg.sessionId ?? crypto.randomUUID();
          logger.info({ ip, sessionId: currentSessionId }, 'Terminal session requested');
          sessionManager.getOrCreateSession(currentSessionId, ws);
        } else if (msg.type === 'data') {
          if (currentSessionId) {
            sessionManager.writeToSession(currentSessionId, Buffer.from(msg.payload, 'base64').toString());
          }
        } else if (msg.type === 'resize') {
          if (currentSessionId) {
            sessionManager.resizeSession(currentSessionId, msg.payload.cols, msg.payload.rows);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to process WS message');
      }
    });

    ws.on('close', () => {
      wsConnections.set(ip, Math.max(0, (wsConnections.get(ip) ?? 1) - 1));
      clearInterval(bytesInterval);
      // Sessions intentionally survive disconnects so the PTY stays alive for reconnects
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully…');
    sessionManager.shutdown();
    server.close(() => process.exit(0));
    // Force-exit if server hasn't closed within 5 s
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
