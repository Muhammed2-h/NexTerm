import { Router } from 'express';
import { SessionManager } from '../sessionManager';

export function createApiRouter(sessionManager: SessionManager, logger: any) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/sessions', (_req, res) => {
    try {
      const sessions = sessionManager.getActiveSessions();
      res.json(sessions);
    } catch (_err) {
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  router.delete('/sessions/:id', (req, res) => {
    try {
      sessionManager.destroySession(req.params['id'] ?? '');
      logger.warn({ id: req.params.id }, 'Session killed via API');
      res.json({ status: 'ok' });
    } catch (_err) {
      res.status(500).json({ error: 'Failed to kill session' });
    }
  });

  return router;
}
