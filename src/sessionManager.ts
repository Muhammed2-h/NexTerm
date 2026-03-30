import * as os from 'os';
import * as pty from 'node-pty';
import { WebSocket } from 'ws';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  pty: pty.IPty;
  history: Buffer[];
  ws: WebSocket | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY_CHUNKS = 200;
const MAX_HISTORY_BYTES = 1024 * 512; // 512 KB cap

// ── Helpers ───────────────────────────────────────────────────────────────────

function getShell(): { shell: string; args: string[] } {
  // ── User override — easiest for any user ──────────────────────────────────
  // Set NEXTERM_SHELL in your .env.local to use any shell, e.g.:
  //   NEXTERM_SHELL=cmd.exe
  //   NEXTERM_SHELL=pwsh.exe
  //   NEXTERM_SHELL=/bin/zsh
  if (process.env.NEXTERM_SHELL) {
    return { shell: process.env.NEXTERM_SHELL, args: [] };
  }

  // ── Auto-detect ───────────────────────────────────────────────────────────
  if (os.platform() === 'win32') {
    // Prefer PowerShell 7 (pwsh) if installed, fall back to Windows PowerShell
    const hasPwsh7 = process.env.PSModulePath?.includes('PowerShell\\7');
    return { shell: hasPwsh7 ? 'pwsh.exe' : 'powershell.exe', args: [] };
  }

  // Unix: use the user's login shell, fall back to bash
  return { shell: process.env.SHELL ?? '/bin/bash', args: ['--login'] };
}


// ── Session Manager ───────────────────────────────────────────────────────────

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

  constructor(logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }) {
    this.logger = logger;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public getOrCreateSession(sessionId: string, ws: WebSocket): pty.IPty {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      // Reattach: swap the WebSocket and replay history
      existing.ws = ws;

      ws.send(
        JSON.stringify({
          type: 'status',
          payload: `\r\nReattached to session: ${sessionId}\r\n`,
        }),
      );

      const combined = this.buildHistoryBuffer(existing.history);
      if (combined.length > 0) {
        ws.send(JSON.stringify({ type: 'data', payload: combined.toString('base64') }));
      }

      return existing.pty;
    }

    return this.createSession(sessionId, ws);
  }

  public resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.resize(cols, rows);
    } catch (err) {
      this.logger.error({ sessionId, err }, 'Failed to resize PTY');
    }
  }

  public writeToSession(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.write(data);
  }

  public destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  public getActiveSessions(): { sessionId: string; pid: number }[] {
    return Array.from(this.sessions.entries()).map(([sessionId, s]) => ({
      sessionId,
      pid: s.pty.pid,
    }));
  }

  public shutdown(): void {
    for (const [id] of this.sessions) {
      this.destroySession(id);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private createSession(sessionId: string, ws: WebSocket): pty.IPty {
    const { shell, args } = getShell();

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: process.env as Record<string, string>,
    });

    this.logger.info({ sessionId, shell, pid: ptyProcess.pid }, 'Spawned PTY');

    const session: Session = { pty: ptyProcess, history: [], ws };
    this.sessions.set(sessionId, session);

    // Pipe PTY output → WebSocket + history ring
    ptyProcess.onData((data: string) => {
      const chunk = Buffer.from(data);
      this.appendHistory(session, chunk);

      const current = this.sessions.get(sessionId);
      if (current?.ws && current.ws.readyState === WebSocket.OPEN) {
        current.ws.send(JSON.stringify({ type: 'data', payload: chunk.toString('base64') }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.logger.info({ sessionId, exitCode }, 'PTY exited');
      const current = this.sessions.get(sessionId);
      if (current?.ws && current.ws.readyState === WebSocket.OPEN) {
        current.ws.send(
          JSON.stringify({
            type: 'status',
            payload: `\r\nSession ended (exit ${exitCode ?? 0}). Refresh to start a new one.\r\n`,
          }),
        );
      }
      this.sessions.delete(sessionId);
    });

    ws.send(JSON.stringify({ type: 'session_id', payload: sessionId }));
    return ptyProcess;
  }

  private appendHistory(session: Session, chunk: Buffer): void {
    session.history.push(chunk);

    // Trim by count
    while (session.history.length > MAX_HISTORY_CHUNKS) {
      session.history.shift();
    }

    // Trim by total byte size
    let total = session.history.reduce((acc, b) => acc + b.length, 0);
    while (total > MAX_HISTORY_BYTES && session.history.length > 0) {
      const removed = session.history.shift();
      total -= removed?.length ?? 0;
    }
  }

  private buildHistoryBuffer(history: Buffer[]): Buffer {
    return history.length > 0 ? Buffer.concat(history) : Buffer.alloc(0);
  }
}
