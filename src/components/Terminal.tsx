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

  // Stable callback ref so the effect doesn't re-run when the store selector
  // produces a new function reference on every render.
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

    // Mark as connecting before the socket even opens
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

    // Ctrl+F: search terminal buffer
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.code === 'KeyF' && e.type === 'keydown') {
        e.preventDefault();
        const searchInput = prompt('Search Terminal Buffer:');
        if (searchInput) {
          searchAddon.findNext(searchInput);
        }
        return false;
      }
      return true;
    });

    term.open(terminalRef.current);

    let rafId: number;
    let isDisposed = false;

    // Connect WebSocket — include token from env if available
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Connection is now open — send the connect handshake
      ws.send(
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
        const data = JSON.parse(event.data as string) as {
          type: string;
          payload?: string;
        };

        if (data.type === 'data' && data.payload) {
          term.write(atob(data.payload));
          // Subtle data-receive pulse animation
          if (wrapperRef.current) {
            wrapperRef.current.classList.remove('animate-data-pulse');
            void wrapperRef.current.offsetWidth; // force reflow to restart animation
            wrapperRef.current.classList.add('animate-data-pulse');
          }
        } else if (data.type === 'status') {
          handleUpdateStatus(sessionId, 'connected');
          if (data.payload) {
            term.write(`\x1b[32m${data.payload}\x1b[0m`);
          }
        } else if (data.type === 'error') {
          handleUpdateStatus(sessionId, 'error');
          if (data.payload) {
            term.write(`\x1b[31m${data.payload}\x1b[0m`);
          }
        } else if (data.type === 'session_id') {
          // Server confirmed session — mark as connected
          handleUpdateStatus(sessionId, 'connected');
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
      if (ws.readyState === WebSocket.OPEN && !isDisposed) {
        ws.send(JSON.stringify({ type: 'data', payload: btoa(data) }));
      }
    });

    const handleResize = () => {
      try {
        if (
          isDisposed ||
          !terminalRef.current ||
          terminalRef.current.clientWidth === 0 ||
          !term.element
        )
          return;

        // Check that xterm's internal renderer is ready before fitting
        const core = (term as unknown as { _core: { _renderService?: { dimensions?: unknown } } })
          ._core;
        if (!core?._renderService?.dimensions) return;

        try {
          fitAddon.fit();
        } catch {
          return;
        }

        if (ws.readyState === WebSocket.OPEN && !isDisposed) {
          ws.send(
            JSON.stringify({
              type: 'resize',
              payload: { cols: term.cols, rows: term.rows },
            }),
          );
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

    // Initial fit after first paint
    rafId = requestAnimationFrame(handleResize);

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
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
    // Position relative so that the scanlines overlay is contained within this element
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <div ref={terminalRef} className="absolute inset-0 z-10" />
      {/* CRT scanline overlay — must be above the terminal canvas */}
      <div className="scanlines" />
    </div>
  );
};
