import React, { useEffect, useRef, useState } from 'react';
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

export const Terminal: React.FC<TerminalProps> = ({ sessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const session = useStore((state) => state.sessions.find((s) => s.id === sessionId));
  const updateStatus = useStore((state) => state.updateSessionStatus);

  useEffect(() => {
    if (!terminalRef.current || !session) return;

    // Initialize xterm.js with Tokyo Night inspired high-graphics transparent theme
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

    let initTimeout: ReturnType<typeof setTimeout>;
    let rafId: number;
    let isDisposed = false;

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      updateStatus(sessionId, 'connecting');
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
        const data = JSON.parse(event.data);
        if (data.type === 'data') {
          term.write(atob(data.payload));

          // Trigger subtle data pulse animation
          if (wrapperRef.current) {
            wrapperRef.current.classList.remove('animate-data-pulse');
            void wrapperRef.current.offsetWidth; // trigger reflow
            wrapperRef.current.classList.add('animate-data-pulse');
          }
        } else if (data.type === 'status') {
          updateStatus(sessionId, 'connected');
          if (data.payload) {
            term.write(`\x1b[32m${data.payload}\x1b[0m`);
          }
        } else if (data.type === 'error') {
          updateStatus(sessionId, 'error');
          term.write(`\x1b[31m${data.payload}\x1b[0m`);
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      if (isDisposed) return;
      updateStatus(sessionId, 'disconnected');
      term.write('\r\n\x1b[31mConnection closed.\x1b[0m');
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

        // Explicitly check if renderService and dimensions are available before fitting
        const core = (term as any)._core;
        if (!core || !core._renderService || !core._renderService.dimensions) return;

        try {
          fitAddon.fit();
        } catch (e) {
          // Ignore fit errors if terminal is not fully ready
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
      } catch (e) {
        console.warn('Resize error', e);
      }
    };

    // Use ResizeObserver for instant, delay-free resizing
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to ensure DOM is painted before fitting
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        handleResize();
      });
    });
    resizeObserver.observe(terminalRef.current);

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(initTimeout);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      ws.close();
      try {
        term.dispose();
      } catch (e) {
        // ignore
      }
    };
  }, [sessionId]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 p-2 overflow-hidden transition-colors duration-300"
    >
      <div ref={terminalRef} className="w-full h-full relative z-20" />
      <div className="scanlines" />
    </div>
  );
};
