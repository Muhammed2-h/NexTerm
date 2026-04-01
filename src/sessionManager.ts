import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as pty from 'node-pty';
import { WebSocket } from 'ws';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  pty: pty.IPty;
  history: Buffer[];
  ws: WebSocket | null;
}

export interface ILogger {
  info: (msg: string | object, detail?: string) => void;
  error: (msg: string | object, detail?: string) => void;
  warn: (msg: string | object, detail?: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY_CHUNKS = 200;
const MAX_HISTORY_BYTES = 1024 * 512; // 512 KB cap

// ── Helpers ───────────────────────────────────────────────────────────────────

function getShell(): { shell: string; args: string[] } {
  // ── User override — set NEXTERM_SHELL in .env.local ───────────────────────
  if (process.env.NEXTERM_SHELL) {
    const shell = process.env.NEXTERM_SHELL;
    const base = path.basename(shell).replace(/\.exe$/i, '').toLowerCase();
    // Pass --login for POSIX-style shells so .bashrc / .profile loads
    const isPosixShell = ['bash', 'zsh', 'sh', 'fish', 'dash'].includes(base);
    const args = isPosixShell ? ['--login'] : [];
    return { shell, args };
  }

  // ── Auto-detect ───────────────────────────────────────────────────────────
  if (os.platform() === 'win32') {
    const hasPwsh7 = process.env.PSModulePath?.includes('PowerShell\\7');
    return { shell: hasPwsh7 ? 'pwsh.exe' : 'powershell.exe', args: [] };
  }

  // Linux / macOS — prefer bash, then the login shell, then sh as final fallback
  const candidates = ['/bin/bash', process.env.SHELL, '/bin/zsh', '/bin/sh'].filter(Boolean) as string[];
  const shell = candidates.find((s) => fs.existsSync(s)) ?? '/bin/sh';

  return { shell, args: ['--login'] };
}

// ── Session Manager ───────────────────────────────────────────────────────────

export class SessionManager {
  private sessions = new Map<string, Session>();
  private logger: ILogger;

  constructor(logger: ILogger) {
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

      if (existing.history.length > 0) {
        const combined = Buffer.concat(existing.history);
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

  public destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Returns a list of all current session IDs and their process IDs.
   */
  public listActiveSessions(): { sessionId: string; pid: number }[] {
    const result: { sessionId: string; pid: number }[] = [];
    for (const [id, session] of this.sessions) {
      result.push({ sessionId: id, pid: session.pty.pid });
    }
    return result;
  }

  public shutdown(): void {
    this.logger.info('Shutting down all active PTY sessions...');
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
    this.sessions.clear();
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

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: 'data', payload: chunk.toString('base64') }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.logger.info({ sessionId, exitCode }, 'PTY exited');
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
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

    // Trim by count first
    while (session.history.length > MAX_HISTORY_CHUNKS) {
      session.history.shift();
    }

    // Trim by total byte size
    let currentTotal = session.history.reduce((acc, b) => acc + b.length, 0);
    while (currentTotal > MAX_HISTORY_BYTES && session.history.length > 0) {
      const removed = session.history.shift() as Buffer; // Guaranteed safe by while check
      currentTotal -= removed.length;
    }
  }
}
