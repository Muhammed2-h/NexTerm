import { Router } from 'express';
import { detectEnvironment } from '../../envDetector';
import { SessionManager } from '../sessionManager';

export function createApiRouter(sessionManager: SessionManager, logger: any) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/capabilities', (req, res) => {
    try {
      const caps = detectEnvironment();
      res.json(caps);
    } catch (e) {
      res.status(500).json({ error: 'Failed to detect environment capabilities' });
    }
  });

  router.get('/sessions', (req, res) => {
    try {
      const sessions = sessionManager.getActiveSessions();
      res.json(sessions);
    } catch (e) {
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  router.delete('/sessions/:id', (req, res) => {
    try {
      sessionManager.killSession(req.params.id);
      logger.warn({ id: req.params.id }, 'Session killed via API');
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to kill session' });
    }
  });

  return router;
}
