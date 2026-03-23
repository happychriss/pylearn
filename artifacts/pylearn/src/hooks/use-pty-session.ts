import { useCallback, useRef, useState } from 'react';
import { useWebSocket } from './use-websocket';

export function usePtySession() {
  const [isRunning, setIsRunning] = useState(false);
  const { emit, on } = useWebSocket('/api/ws');
  const onOutputRef = useRef<((data: string) => void) | null>(null);
  const onExitRef = useRef<((code: number) => void) | null>(null);

  const listen = useCallback((
    onOutput: (data: string) => void,
    onExit: (code: number) => void
  ) => {
    onOutputRef.current = onOutput;
    onExitRef.current = onExit;

    const off1 = on('pty-output', (msg: Record<string, unknown>) => {
      onOutputRef.current?.(msg.data as string);
    });

    const off2 = on('pty-exit', (msg: Record<string, unknown>) => {
      setIsRunning(false);
      onExitRef.current?.(msg.exitCode as number);
    });

    return () => { off1(); off2(); };
  }, [on]);

  const runCode = useCallback((code: string) => {
    setIsRunning(true);
    emit('run-code', { code });
  }, [emit]);

  const sendInput = useCallback((data: string) => {
    emit('pty-input', { data });
  }, [emit]);

  const stopCode = useCallback(() => {
    emit('stop-code', {});
    setIsRunning(false);
  }, [emit]);

  return { isRunning, runCode, sendInput, stopCode, listen };
}
