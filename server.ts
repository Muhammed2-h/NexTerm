import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import cors from 'cors';
import { detectEnvironment } from './envDetector';

const PORT = 3000;

// Session Manager to handle persistence across browser reloads
class SessionManager {
  private sessions: Map<string, { pty: ChildProcess, history: Buffer[], ws: WebSocket | null }> = new Map();
  private hasTmux = false;

  constructor() {
    try {
      execSync('which tmux 2>/dev/null');
      this.hasTmux = true;
    } catch (e) {
      this.hasTmux = false;
    }
  }

  public getOrCreateSession(sessionId: string, ws: WebSocket) {
    if (this.hasTmux) {
      return this.getOrCreateTmuxSession(sessionId, ws);
    } else {
      return this.getOrCreateMemorySession(sessionId, ws);
    }
  }

  private getOrCreateTmuxSession(sessionId: string, ws: WebSocket) {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    let sessionExists = false;
    try {
      execSync(`tmux has-session -t ${safeId} 2>/dev/null`);
      sessionExists = true;
    } catch (e) {
      sessionExists = false;
    }

    let ptyProcess: ChildProcess;

    if (sessionExists) {
      ptyProcess = spawn('python3', ['-c', `import pty; pty.spawn(["tmux", "attach-session", "-t", "${safeId}"])`], {
        env: { ...process.env, TERM: 'xterm-256color' }
      });
      ws.send(JSON.stringify({ type: 'status', payload: `\r\nReattached to tmux session: ${safeId}\r\n` }));
    } else {
      ptyProcess = spawn('python3', ['-c', `import os; os.environ["PS1"] = "root@localhost:\\\\w# "; import pty; pty.spawn(["tmux", "new-session", "-A", "-s", "${safeId}", "/bin/bash --norc --noprofile"])`], {
        env: { ...process.env, TERM: 'xterm-256color' }
      });
      ws.send(JSON.stringify({ type: 'status', payload: '' }));
    }

    // For tmux, we just spawn a new client process every time, so we can just attach events directly to this process.
    this.attachPtyEvents(ptyProcess, ws, sessionId, false);
    return ptyProcess;
  }

  private getOrCreateMemorySession(sessionId: string, ws: WebSocket) {
    let session = this.sessions.get(sessionId);

    if (session) {
      ws.send(JSON.stringify({ type: 'status', payload: `\r\nReattached to memory session: ${sessionId}\r\n` }));
      
      const historyBuffer = Buffer.concat(session.history);
      if (historyBuffer.length > 0) {
        ws.send(JSON.stringify({ type: 'data', payload: historyBuffer.toString('base64') }));
      }
      
      session.ws = ws;
    } else {
      const ptyProcess = spawn('python3', ['-c', 'import os; os.environ["PS1"] = "root@localhost:\\\\w# "; import pty; pty.spawn(["/bin/bash", "--norc", "--noprofile"])'], {
        env: { ...process.env, TERM: 'xterm-256color' }
      });
      
      session = { pty: ptyProcess, history: [], ws };
      this.sessions.set(sessionId, session);
      ws.send(JSON.stringify({ type: 'status', payload: '' }));
      
      this.attachPtyEvents(ptyProcess, ws, sessionId, true);
    }

    return session.pty;
  }

  public attachPtyEvents(ptyProcess: ChildProcess, ws: WebSocket, sessionId: string, isMemory: boolean) {
    const onData = (chunk: Buffer) => {
      if (isMemory) {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.history.push(chunk);
          if (session.history.length > 100) session.history.shift();
          if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'data', payload: chunk.toString('base64') }));
          }
        }
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', payload: chunk.toString('base64') }));
        }
      }
    };

    ptyProcess.stdout?.on('data', onData);
    ptyProcess.stderr?.on('data', onData);

    ptyProcess.on('close', (code: number) => {
      if (isMemory) {
        const session = this.sessions.get(sessionId);
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'status', payload: `\r\nTerminal exited with code ${code}\r\n` }));
        }
        this.sessions.delete(sessionId);
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'status', payload: `\r\nTerminal exited with code ${code}\r\n` }));
        }
      }
    });

    ptyProcess.on('error', (err: Error) => {
      if (isMemory) {
        const session = this.sessions.get(sessionId);
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'error', payload: `\r\nFailed to start terminal: ${err.message}\r\n` }));
        }
        this.sessions.delete(sessionId);
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', payload: `\r\nFailed to start terminal: ${err.message}\r\n` }));
        }
      }
    });
  }

  public getActiveSessions() {
    if (this.hasTmux) {
      try {
        const output = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null').toString();
        return output.split('\n').filter(Boolean).map(id => ({ id, name: `Terminal ${id.replace('session_', '')}` }));
      } catch (e) {
        return [];
      }
    } else {
      return Array.from(this.sessions.keys()).map(id => ({ id, name: `Terminal ${id.replace('session_', '')}` }));
    }
  }

  public hasTmuxSession(sessionId: string) {
    if (!this.hasTmux) return false;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      execSync(`tmux has-session -t ${safeId} 2>/dev/null`);
      return true;
    } catch (e) {
      return false;
    }
  }

  public hasMemorySession(sessionId: string) {
    return this.sessions.has(sessionId);
  }

  public killSession(sessionId: string) {
    if (this.hasTmux) {
      const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
      try {
        execSync(`tmux kill-session -t ${safeId} 2>/dev/null`);
      } catch (e) {
        // ignore
      }
    }
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }
}

const sessionManager = new SessionManager();

async function startServer() {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/capabilities', (req, res) => {
    try {
      const caps = detectEnvironment();
      res.json(caps);
    } catch (e) {
      res.status(500).json({ error: 'Failed to detect environment capabilities' });
    }
  });

  app.get('/api/sessions', (req, res) => {
    try {
      const sessions = sessionManager.getActiveSessions();
      res.json(sessions);
    } catch (e) {
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    try {
      sessionManager.killSession(req.params.id);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to kill session' });
    }
  });

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket Server for Terminal
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });

  wss.on('connection', (ws) => {
    let ptyProcess: ChildProcess | null = null;
    let currentSessionId: string | null = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'connect') {
          const sessionId = data.sessionId || `session_${Math.random().toString(36).substring(7)}`;
          currentSessionId = sessionId;
          
          ptyProcess = sessionManager.getOrCreateSession(sessionId, ws);

        } else if (data.type === 'data') {
          if (ptyProcess && ptyProcess.stdin) {
            ptyProcess.stdin.write(Buffer.from(data.payload, 'base64'));
          }
        } else if (data.type === 'resize') {
          // Resizing a python-spawned PTY is tricky without native bindings,
          // but we can send the stty command to resize it if needed, or just rely on xterm.js wrapping.
          if (ptyProcess && ptyProcess.stdin) {
            // Send stty command to resize the terminal
            // ptyProcess.stdin.write(`stty cols ${data.payload.cols} rows ${data.payload.rows}\n`);
          }
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    });

    ws.on('close', () => {
      // If using tmux, ptyProcess is just the client, so we can kill it.
      // The actual shell is running inside the tmux server.
      if (currentSessionId) {
        const isMemory = sessionManager.hasMemorySession(currentSessionId);
        if (!isMemory && ptyProcess) {
          ptyProcess.kill();
        }
      }
    });
  });
}

startServer().catch(console.error);
