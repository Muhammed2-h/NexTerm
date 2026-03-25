import { ChildProcess, execFileSync, spawn } from 'child_process';
import { WebSocket } from 'ws';

type HistoryBuffer = Buffer[];

// Session Manager to handle persistence across browser reloads
export class SessionManager {
  private sessions: Map<
    string,
    { pty: ChildProcess; history: HistoryBuffer; ws: WebSocket | null }
  > = new Map();
  private hasTmux = false;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
    try {
      execFileSync('which', ['tmux'], { stdio: 'ignore' });
      this.hasTmux = true;
    } catch (e) {
      this.hasTmux = false;
    }
  }

  public getOrCreateSession(sessionId: string, ws: WebSocket): ChildProcess {
    if (this.hasTmux) {
      return this.getOrCreateTmuxSession(sessionId, ws);
    } else {
      return this.getOrCreateMemorySession(sessionId, ws);
    }
  }

  private getOrCreateTmuxSession(sessionId: string, ws: WebSocket): ChildProcess {
    const safeId = sessionId;

    let sessionExists = false;
    try {
      execFileSync('tmux', ['has-session', '-t', safeId], { stdio: 'ignore' });
      sessionExists = true;
    } catch (e) {
      sessionExists = false;
    }

    let ptyProcess: ChildProcess;

    if (sessionExists) {
      ptyProcess = spawn(
        'python3',
        [
          '-c',
          `import sys; import pty; pty.spawn(["tmux", "attach-session", "-t", sys.argv[1]])`,
          safeId,
        ],
        {
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );
      ws.send(
        JSON.stringify({
          type: 'status',
          payload: `\r\nReattached to tmux session: ${safeId}\r\n`,
        }),
      );
    } else {
      ptyProcess = spawn(
        'python3',
        [
          '-c',
          `import sys; import os; os.environ["PS1"] = "\\\\u@\\\\h:\\\\w\\\\$ "; import pty; pty.spawn(["tmux", "new-session", "-A", "-s", sys.argv[1], "/bin/bash", "--norc", "--noprofile"])`,
          safeId,
        ],
        {
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );
      ws.send(JSON.stringify({ type: 'status', payload: '' }));
    }

    this.attachPtyEvents(ptyProcess, ws, sessionId, false);
    return ptyProcess;
  }

  private getOrCreateMemorySession(sessionId: string, ws: WebSocket): ChildProcess {
    let session = this.sessions.get(sessionId);

    if (session) {
      ws.send(
        JSON.stringify({
          type: 'status',
          payload: `\r\nReattached to memory session: ${sessionId}\r\n`,
        }),
      );

      const historyBuffer = Buffer.concat(session.history);
      if (historyBuffer.length > 0) {
        ws.send(JSON.stringify({ type: 'data', payload: historyBuffer.toString('base64') }));
      }

      session.ws = ws;
    } else {
      const ptyProcess = spawn(
        'python3',
        [
          '-c',
          'import os; os.environ["PS1"] = "\\\\u@\\\\h:\\\\w\\\\$ "; import pty; pty.spawn(["/bin/bash", "--norc", "--noprofile"])',
        ],
        {
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );

      session = { pty: ptyProcess, history: [], ws };
      this.sessions.set(sessionId, session);
      ws.send(JSON.stringify({ type: 'status', payload: '' }));

      this.attachPtyEvents(ptyProcess, ws, sessionId, true);
    }

    return session.pty;
  }

  public attachPtyEvents(
    ptyProcess: ChildProcess,
    ws: WebSocket,
    sessionId: string,
    isMemory: boolean,
  ): void {
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
      this.logger.info({ sessionId, code }, 'Session closed');
      if (isMemory) {
        const session = this.sessions.get(sessionId);
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(
            JSON.stringify({
              type: 'status',
              payload: `\r\nTerminal exited with code ${code}\r\n`,
            }),
          );
        }
        this.sessions.delete(sessionId);
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'status',
              payload: `\r\nTerminal exited with code ${code}\r\n`,
            }),
          );
        }
      }
    });

    ptyProcess.on('error', (err: Error) => {
      this.logger.error({ err, sessionId }, 'PTY spawn error');

      const errorPayload = `\r\nTerminal failed to start. Contact admin.\r\n`;

      if (isMemory) {
        const session = this.sessions.get(sessionId);
        if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'error', payload: errorPayload }));
        }
        this.sessions.delete(sessionId);
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', payload: errorPayload }));
        }
      }
    });
  }

  public getActiveSessions(): { id: string; name: string }[] {
    if (this.hasTmux) {
      try {
        const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}']).toString();
        return output
          .split('\n')
          .filter(Boolean)
          .map((id) => ({ id, name: `Terminal ${id.replace(/^session_/, '')}` }));
      } catch (e) {
        return [];
      }
    } else {
      return Array.from(this.sessions.keys()).map((id) => ({
        id,
        name: `Terminal ${id.replace(/^session_/, '')}`,
      }));
    }
  }

  public hasTmuxSession(sessionId: string): boolean {
    if (!this.hasTmux) return false;
    try {
      execFileSync('tmux', ['has-session', '-t', sessionId], { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  public hasMemorySession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  public killSession(sessionId: string): void {
    if (this.hasTmux) {
      try {
        execFileSync('tmux', ['kill-session', '-t', sessionId], { stdio: 'ignore' });
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
