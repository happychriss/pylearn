import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from './use-websocket';

export interface DisplayMessage {
  mime: string;
  data: unknown;
  id?: string;
  append?: boolean;
}

export interface SpriteState {
  x: number;
  y: number;
  duration?: number; // seconds — only set on move events, cleared on show
}

export interface AdventureState {
  background: string | null;
  sprites: Record<string, SpriteState>;
  messages: string[];
  question: string | null;
}

const INITIAL_ADVENTURE: AdventureState = {
  background: null,
  sprites: {},
  messages: [],
  question: null,
};

export function useDisplayEvents(filterUserId?: string) {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [adventureState, setAdventureState] = useState<AdventureState>(INITIAL_ADVENTURE);
  const [hasNewEvent, setHasNewEvent] = useState(false);
  const activeTabRef = useRef<string>('code');
  const filterUserIdRef = useRef(filterUserId);
  const { on } = useWebSocket('/api/ws');

  useEffect(() => {
    filterUserIdRef.current = filterUserId;
    setDisplayMessages([]);
    setAdventureState(INITIAL_ADVENTURE);
    setHasNewEvent(false);
  }, [filterUserId]);

  useEffect(() => {
    const cleanup = on('display-event', (msg: Record<string, unknown>) => {
      if (filterUserIdRef.current && msg.userId !== filterUserIdRef.current) return;

      const event = msg.event as DisplayMessage;
      if (!event?.mime) return;

      if (activeTabRef.current !== 'output') {
        setHasNewEvent(true);
      }

      // Scene events update adventure state
      if (event.mime === 'application/vnd.pylearn.scene+json') {
        const data = event.data as Record<string, unknown>;
        switch (data.type) {
          case 'scene':
            setAdventureState((prev) => ({
              ...prev,
              background: data.name as string,
              messages: [],
              question: null,
            }));
            break;
          case 'show':
            setAdventureState((prev) => ({
              ...prev,
              sprites: {
                ...prev.sprites,
                [data.sprite as string]: { x: data.x as number, y: data.y as number },
              },
            }));
            break;
          case 'move':
            setAdventureState((prev) => ({
              ...prev,
              sprites: {
                ...prev.sprites,
                [data.sprite as string]: {
                  x: data.x as number,
                  y: data.y as number,
                  duration: (data.duration as number) || 0,
                },
              },
            }));
            break;
          case 'say':
            setAdventureState((prev) => ({
              ...prev,
              messages: [...prev.messages, data.text as string],
            }));
            break;
          case 'ask':
            setAdventureState((prev) => ({
              ...prev,
              question: data.prompt as string,
            }));
            break;
        }
        return; // Scene events don't go to display message list
      }

      // All other display messages go to the output list
      setDisplayMessages((prev) => {
        // If the message has an ID, update existing message with same ID
        if (event.id) {
          const existingIdx = prev.findIndex((m) => m.id === event.id);
          if (existingIdx !== -1 && !event.append) {
            const updated = [...prev];
            updated[existingIdx] = event;
            return updated;
          }
        }
        return [...prev, event];
      });
    });

    return () => { cleanup(); };
  }, [on]);

  const setActiveTab = useCallback((tab: string) => {
    activeTabRef.current = tab;
  }, []);

  const clearNewEvent = useCallback(() => {
    setHasNewEvent(false);
  }, []);

  const resetState = useCallback(() => {
    setDisplayMessages([]);
    setAdventureState(INITIAL_ADVENTURE);
  }, []);

  const hasAdventureContent = !!(
    adventureState.background ||
    Object.keys(adventureState.sprites).length > 0 ||
    adventureState.messages.length > 0 ||
    adventureState.question
  );

  const hasDisplayContent = displayMessages.length > 0 || hasAdventureContent;

  return {
    displayMessages,
    adventureState,
    hasNewEvent,
    hasDisplayContent,
    hasAdventureContent,
    clearNewEvent,
    resetState,
    setActiveTab,
  };
}
