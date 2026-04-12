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
  size?: number;     // virtual units (0–500); undefined = default
  fromX?: number;   // previous x before a move — drives CSS transition
  fromY?: number;   // previous y before a move — drives CSS transition
}

export interface TextState {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  background: string | null;
}

export interface AdventureMessage {
  text: string;
  color?: string;
  size?: number;
  background?: string;
}

export interface AdventureState {
  background: string | null;
  sprites: Record<string, SpriteState>;
  texts: Record<string, TextState>;
  messages: AdventureMessage[];
  question: AdventureMessage | null;
  generation: number; // increments on every resetState — forces SpriteElement remount
}

const INITIAL_ADVENTURE: AdventureState = {
  background: null,
  sprites: {},
  texts: {},
  messages: [],
  question: null,
  generation: 0,
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
              // texts intentionally preserved — HUD labels (score, etc.) survive scene transitions
            }));
            break;
          case 'show':
            setAdventureState((prev) => ({
              ...prev,
              sprites: {
                ...prev.sprites,
                [data.sprite as string]: {
                  x: data.x as number,
                  y: data.y as number,
                  size: data.size as number | undefined,
                },
              },
            }));
            break;
          case 'move':
            setAdventureState((prev) => {
              const existing = prev.sprites[data.sprite as string];
              return {
                ...prev,
                sprites: {
                  ...prev.sprites,
                  [data.sprite as string]: {
                    x: data.x as number,
                    y: data.y as number,
                    duration: (data.duration as number) || 0,
                    size: existing?.size,
                    fromX: existing?.x,
                    fromY: existing?.y,
                  },
                },
              };
            });
            break;
          case 'say':
            setAdventureState((prev) => ({
              ...prev,
              messages: [...prev.messages, {
                text: data.text as string,
                color: data.color as string | undefined,
                size: data.size as number | undefined,
                background: data.background as string | undefined,
              }],
            }));
            break;
          case 'ask':
            setAdventureState((prev) => ({
              ...prev,
              question: {
                text: data.prompt as string,
                color: data.color as string | undefined,
                size: data.size as number | undefined,
                background: data.background as string | undefined,
              },
            }));
            break;
          case 'show_text': {
            const name = data.name as string;
            setAdventureState((prev) => {
              const existing = prev.texts[name];
              const merged: TextState = {
                text: data.text as string,
                x: (data.x as number | undefined) ?? existing?.x ?? 0,
                y: (data.y as number | undefined) ?? existing?.y ?? 0,
                size: (data.size as number | undefined) ?? existing?.size ?? 20,
                color: (data.color as string | undefined) ?? existing?.color ?? 'white',
                background: data.background !== undefined
                  ? (data.background as string | null)
                  : (existing?.background ?? null),
              };
              return { ...prev, texts: { ...prev.texts, [name]: merged } };
            });
            break;
          }
          case 'clear_text': {
            const name = data.name as string | undefined;
            setAdventureState((prev) => {
              if (!name) return { ...prev, texts: {} };
              const next = { ...prev.texts };
              delete next[name];
              return { ...prev, texts: next };
            });
            break;
          }
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

  // Called on program exit: clears only the active question so the input field
  // disappears, but keeps the rest of the scene (background, sprites, messages) visible.
  const clearQuestion = useCallback(() => {
    setAdventureState(prev => ({ ...prev, question: null }));
  }, []);

  const generationRef = useRef(0);
  const resetState = useCallback(() => {
    generationRef.current += 1;
    const gen = generationRef.current;
    setDisplayMessages([]);
    setAdventureState({ ...INITIAL_ADVENTURE, generation: gen });
  }, []);

  const hasAdventureContent = !!(
    adventureState.background ||
    Object.keys(adventureState.sprites).length > 0 ||
    Object.keys(adventureState.texts).length > 0 ||
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
    clearQuestion,
    resetState,
    setActiveTab,
  };
}
