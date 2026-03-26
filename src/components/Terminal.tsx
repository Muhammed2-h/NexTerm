import { type FC, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import 'xterm/css/xterm.css';
import { useStore } from '../store/useStore';

interface TerminalProps {
  sessionId: string;
}

export const Terminal: FC<TerminalProps> = ({ sessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const updateStatus = useStore((state) => state.updateSessionStatus);

  // Stable ref so the effect doesn't re-run when the store selector produces
  // a new function reference on every render.
  const updateStatusRef = useRef(updateStatus);
  updateStatusRef.current = updateStatus;

  const handleUpdateStatus = useCallback(
    (id: string, status: Parameters<typeof updateStatus>[1]) => {
      updateStatusRef.current(id, status);
    },
    [],
  );

  useEffect(() => {
    if (!terminalRef.current) return;

    handleUpdateStatus(sessionId, 'connecting');

    const term = new XTerm({
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: 'transparent',
        foreground: '#a9b1d6',
        cursor: '#f7768e',
        cursorAccent: '#1a1b26',
        selectionBackground: 'rgba(51, 70, 124, 0.5)',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#c0caf5',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const clipboardAddon = new ClipboardAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(searchAddon);
    term.loadAddon(clipboardAddon);

    // Ctrl+F: inline search
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.code === 'KeyF' && e.type === 'keydown') {
        e.preventDefault();
        const q = prompt('Search terminal buffer:');
        if (q) searchAddon.findNext(q);
        return false;
      }
      return true;
    });

    term.open(terminalRef.current);

    let rafId: number;
    let isDisposed = false;
    // ws may be opened after the async token fetch completes
    let ws: WebSocket | null = null;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const handleResize = () => {
      try {
        if (isDisposed || !terminalRef.current || terminalRef.current.clientWidth === 0 || !term.element)
          return;
        const core = (term as unknown as { _core: { _renderService?: { dimensions?: unknown } } })._core;
        if (!core?._renderService?.dimensions) return;
        try {
          fitAddon.fit();
        } catch {
          return;
        }
        if (ws && ws.readyState === WebSocket.OPEN && !isDisposed) {
          ws.send(JSON.stringify({ type: 'resize', payload: { cols: term.cols, rows: term.rows } }));
        }
      } catch (err) {
        console.warn('Resize error', err);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);
    // Initial fit
    rafId = requestAnimationFrame(handleResize);

    // Fetch auth token then open the WebSocket
    fetch('/api/token')
      .then((r) => r.json() as Promise<{ token: string }>)
      .then((data) => {
        if (isDisposed) return;

        const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(data.token)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws!.send(
            JSON.stringify({
              type: 'connect',
              sessionId: sessionId,
              payload: { type: 'local' },
            }),
          );
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const msg = JSON.parse(event.data as string) as { type: string; payload?: string };
            if (msg.type === 'data' && msg.payload) {
              term.write(atob(msg.payload));
              if (wrapperRef.current) {
                wrapperRef.current.classList.remove('animate-data-pulse');
                void wrapperRef.current.offsetWidth;
                wrapperRef.current.classList.add('animate-data-pulse');
              }
            } else if (msg.type === 'status') {
              handleUpdateStatus(sessionId, 'connected');
              if (msg.payload) term.write(`\x1b[32m${msg.payload}\x1b[0m`);
            } else if (msg.type === 'session_id') {
              handleUpdateStatus(sessionId, 'connected');
            } else if (msg.type === 'error') {
              handleUpdateStatus(sessionId, 'error');
              if (msg.payload) term.write(`\x1b[31m${msg.payload}\x1b[0m`);
            }
          } catch (e) {
            console.error('Failed to parse WS message', e);
          }
        };

        ws.onclose = () => {
          if (isDisposed) return;
          handleUpdateStatus(sessionId, 'disconnected');
          term.write('\r\n\x1b[31mConnection closed.\x1b[0m');
        };

        ws.onerror = () => {
          if (isDisposed) return;
          handleUpdateStatus(sessionId, 'error');
          term.write('\r\n\x1b[31mWebSocket connection failed.\x1b[0m');
        };

        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN && !isDisposed) {
            ws.send(JSON.stringify({ type: 'data', payload: btoa(data) }));
          }
        });
      })
      .catch((err) => {
        console.error('Failed to fetch auth token', err);
        handleUpdateStatus(sessionId, 'error');
        term.write('\r\n\x1b[31mFailed to authenticate with server.\x1b[0m');
      });

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      try {
        term.dispose();
      } catch {
        // ignore disposal errors
      }
    };
  }, [sessionId, handleUpdateStatus]);

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <div ref={terminalRef} className="absolute inset-0 z-10" />
      {/* CRT scanline overlay */}
      <div className="scanlines" />
    </div>
  );
};
