import { type FC, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';
import { useStore } from '../store/useStore';

interface TerminalProps {
  sessionId: string;
  token?: string; // pre-fetched from login; if omitted falls back to GET /api/token
}

export const Terminal: FC<TerminalProps> = ({ sessionId, token: preloadedToken }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const updateStatus = useStore((state) => state.updateSessionStatus);

  // Stable ref so the effect doesn't re-run when the store selector produces
  // a new function reference on every render.
  const updateStatusRef = useRef(updateStatus);
  updateStatusRef.current = updateStatus;

  // Token ref — captured once at mount; never changes, so not a dep of useEffect
  const tokenRef = useRef(preloadedToken);

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

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(searchAddon);

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

    // ── Terminal Clipboard Behavior (Primary Selection & Mouse Paste) ─────────
    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(selection).catch(() => {
          // Ignore copy errors (e.g., if used without HTTPS)
        });
      }
    });

    let rafId: number;
    let isDisposed = false;
    let ws: WebSocket | null = null;

    const handleMousePaste = (e: MouseEvent) => {
      // Intercept Middle Click (button === 1) or Right Click (contextmenu)
      if (e.button === 1 || e.type === 'contextmenu') {
        e.preventDefault();
        if (navigator?.clipboard?.readText) {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && ws && ws.readyState === WebSocket.OPEN) {
                // btoa requires string conversion, but `text` can contain multibyte characters.
                // standard btoa fails on raw utf-8, so we use encodeURIComponent first as a quick trick,
                // but the backend expects raw base64. Let's send raw bytes properly.
                // To be safe with btoa and UTF8:
                const utf8Bytes = new TextEncoder().encode(text);
                const binaryString = String.fromCodePoint(...utf8Bytes);
                ws.send(JSON.stringify({ type: 'data', payload: btoa(binaryString) }));
              }
            })
            .catch((err) => console.warn('Clipboard read error:', err));
        }
      }
    };

    term.element?.addEventListener('contextmenu', handleMousePaste as EventListener);
    term.element?.addEventListener('auxclick', handleMousePaste as EventListener);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const handleResize = () => {
      if (isDisposed || !terminalRef.current || terminalRef.current.clientWidth === 0 || !term.element)
        return;
      
      // Xterm provides _core for deep access which can be risky; prefer fit() check.
      try {
        fitAddon.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', payload: { cols: term.cols, rows: term.rows } }));
        }
      } catch (err) {
        console.warn('Fitting error - typical during rapid resize / tab change:', err);
      }
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      // Debounce: prevent fit() → reflow → blink issues by staggering fits.
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        rafId = requestAnimationFrame(handleResize);
      }, 150);
    });

    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);
    
    // Initial fit
    rafId = requestAnimationFrame(handleResize);

    // Use pre-loaded token (from login) or fall back to fetching from /api/token
    const tokenSource = tokenRef.current
      ? Promise.resolve({ token: tokenRef.current })
      : (fetch('/api/token').then((r) => r.json()) as Promise<{ token: string }>);

    tokenSource
      .then((data) => {
        if (isDisposed) return;

        const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(data.token)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!ws || isDisposed) return;
          ws.send(JSON.stringify({ type: 'connect', sessionId }));
        };

        ws.onmessage = (event) => {
          if (isDisposed || typeof event.data !== 'string') return;
          try {
            const msg = JSON.parse(event.data) as { type: string; payload?: string };
            if (msg.type === 'data' && msg.payload) {
              term.write(atob(msg.payload));
            } else if (msg.type === 'status' || msg.type === 'session_id') {
              handleUpdateStatus(sessionId, 'connected');
              if (msg.payload && msg.type === 'status') term.write(`\x1b[32m${msg.payload}\x1b[0m`);
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
        console.error('Failed to authenticate terminal', err);
        handleUpdateStatus(sessionId, 'error');
        term.write('\r\n\x1b[31mAuthentication failed.\x1b[0m');
      });

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      try {
        term.element?.removeEventListener('contextmenu', handleMousePaste as EventListener);
        term.element?.removeEventListener('auxclick', handleMousePaste as EventListener);
        term.dispose();
      } catch {
        // ignore disposal errors
      }
    };
  }, [sessionId, handleUpdateStatus]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={terminalRef} className="absolute inset-0 z-10" />
      {/* CRT scanline overlay effect */}
      <div className="scanlines pointer-events-none" />
    </div>
  );
};
