import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from './use-websocket';

export interface SpriteState {
  x: number;
  y: number;
}

export interface AdventureState {
  background: string | null;
  sprites: Record<string, SpriteState>;
  dialogue: string | null;
}

const INITIAL_STATE: AdventureState = {
  background: null,
  sprites: {},
  dialogue: null,
};

export function useAdventureEvents(filterUserId?: string) {
  const [state, setState] = useState<AdventureState>(INITIAL_STATE);
  const [hasNewEvent, setHasNewEvent] = useState(false);
  const activeTabRef = useRef<string>('code');
  const filterUserIdRef = useRef(filterUserId);
  const { on } = useWebSocket('/api/ws');

  useEffect(() => {
    filterUserIdRef.current = filterUserId;
    setState(INITIAL_STATE);
    setHasNewEvent(false);
  }, [filterUserId]);

  useEffect(() => {
    const cleanup = on('adventure-event', (msg: Record<string, unknown>) => {
      if (filterUserIdRef.current && msg.userId !== filterUserIdRef.current) return;

      const event = msg.event as Record<string, unknown>;
      if (!event) return;

      if (activeTabRef.current !== 'adventure') {
        setHasNewEvent(true);
      }

      switch (event.type) {
        case 'scene':
          setState((prev) => ({
            ...prev,
            background: event.name as string,
          }));
          break;
        case 'show':
          setState((prev) => ({
            ...prev,
            sprites: {
              ...prev.sprites,
              [event.sprite as string]: {
                x: event.x as number,
                y: event.y as number,
              },
            },
          }));
          break;
        case 'move':
          setState((prev) => ({
            ...prev,
            sprites: {
              ...prev.sprites,
              [event.sprite as string]: {
                x: event.x as number,
                y: event.y as number,
              },
            },
          }));
          break;
        case 'say':
          setState((prev) => ({
            ...prev,
            dialogue: event.text as string,
          }));
          break;
        case 'ask':
          setState((prev) => ({
            ...prev,
            dialogue: event.prompt as string,
          }));
          break;
      }
    });
    return cleanup;
  }, [on]);

  const setActiveTab = useCallback((tab: string) => {
    activeTabRef.current = tab;
  }, []);

  const startListening = useCallback(() => {}, []);

  const clearNewEvent = useCallback(() => {
    setHasNewEvent(false);
  }, []);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { state, hasNewEvent, clearNewEvent, resetState, startListening, setActiveTab };
}
