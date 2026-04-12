import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  onInput?: (data: string) => void;
  terminalRef?: React.MutableRefObject<XTerm | null>;
  readOnly?: boolean;
}

export function Terminal({ onInput, terminalRef, readOnly = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#f0fdf4',
        foreground: '#14532d',
        cursor: readOnly ? '#00000000' : '#15803d',
        black: '#1c1917',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#b45309',
        blue: '#1d4ed8',
        magenta: '#7c3aed',
        cyan: '#0e7490',
        white: '#374151',
        brightBlack: '#6b7280',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#d97706',
        brightBlue: '#3b82f6',
        brightMagenta: '#8b5cf6',
        brightCyan: '#06b6d4',
        brightWhite: '#111827',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: !readOnly,
      disableStdin: readOnly,
      scrollback: 1000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);
    fitAddon.fit();

    if (!readOnly && onInput) {
      xterm.onData((data) => onInput(data));
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    if (terminalRef) terminalRef.current = xterm;

    const observer = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      if (terminalRef) terminalRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: '4px' }}
    />
  );
}
