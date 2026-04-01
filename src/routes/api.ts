import { Router } from 'express';
import { SessionManager, ILogger } from '../sessionManager';

export function createApiRouter(sessionManager: SessionManager, logger: ILogger) {
  const router = Router();

  // ── Health check ─────────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ── Session management ────────────────────────────────────────────────────────

  // List all active PTY session IDs and PIDs
  router.get('/sessions', (_req, res) => {
    try {
      const sessions = sessionManager.listActiveSessions();
      res.json(sessions);
    } catch (err) {
      logger.error({ err }, 'Failed to list sessions');
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // Explicitly terminate a session
  router.delete('/sessions/:id', (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    try {
      const killed = sessionManager.destroySession(id);
      if (killed) {
        logger.warn({ id }, 'Session explicitly terminated via API');
        res.json({ status: 'ok' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (err) {
      logger.error({ id, err }, 'Exception while killing session');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
