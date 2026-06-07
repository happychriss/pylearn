import { useCallback, useEffect, useRef } from 'react';

/**
 * Leading + trailing throttle. The callback fires immediately, then at most once
 * per `delay` ms while called repeatedly, always flushing the most recent args.
 *
 * Used to rate-limit the per-keystroke `file-changed` / `co-edit-delta` WebSocket
 * broadcasts: live mirroring stays responsive but we stop sending a full-file
 * payload on every single keypress (which amplified clobbering and network churn
 * during co-editing).
 */
export function useThrottledCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay = 120,
): (...args: T) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgs = useRef<T | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback((...args: T) => {
    pendingArgs.current = args;
    const since = Date.now() - lastRun.current;
    const flush = () => {
      lastRun.current = Date.now();
      timer.current = null;
      if (pendingArgs.current) {
        fnRef.current(...pendingArgs.current);
        pendingArgs.current = null;
      }
    };
    if (since >= delay) {
      flush();
    } else if (!timer.current) {
      timer.current = setTimeout(flush, delay - since);
    }
  }, [delay]);
}
