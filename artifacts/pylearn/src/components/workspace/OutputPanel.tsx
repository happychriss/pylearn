import React, { useEffect, useRef, useState, useCallback } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import { useAuth } from '@workspace/auth-web';
import { Image, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DisplayMessage, AdventureState, SpriteState } from '@/hooks/use-display-events';

// ---------------------------------------------------------------------------
// Renderer Registry
// ---------------------------------------------------------------------------

interface RendererProps {
  data: unknown;
}

// -- Plotly Renderer --

function PlotlyRenderer({ data }: RendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const plotData = data as { data?: Plotly.Data[]; layout?: Partial<Plotly.Layout> };

    Plotly.newPlot(
      container,
      plotData.data ?? [],
      {
        ...(plotData.layout ?? {}),
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(30,41,59,0.5)',
        font: { color: '#e2e8f0' },
        margin: { t: 40, r: 20, b: 40, l: 50 },
      },
      { responsive: true, displayModeBar: false }
    );

    return () => { Plotly.purge(container); };
  }, [data]);

  return <div ref={containerRef} className="w-full min-h-[300px]" />;
}

// -- Canvas Renderer (Turtle graphics) --

function CanvasRenderer({ data }: RendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasData = data as { commands: Array<Record<string, unknown>>; width: number; height: number };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvasData.width || 600;
    const h = canvasData.height || 400;
    canvas.width = w;
    canvas.height = h;

    // Default background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    for (const cmd of canvasData.commands || []) {
      switch (cmd.cmd) {
        case 'bgcolor':
          ctx.fillStyle = cmd.color as string;
          ctx.fillRect(0, 0, w, h);
          break;

        case 'line':
          ctx.beginPath();
          ctx.moveTo(cmd.x1 as number, cmd.y1 as number);
          ctx.lineTo(cmd.x2 as number, cmd.y2 as number);
          ctx.strokeStyle = cmd.color as string || '#000';
          ctx.lineWidth = cmd.width as number || 2;
          ctx.lineCap = 'round';
          ctx.stroke();
          break;

        case 'circle': {
          ctx.beginPath();
          ctx.arc(cmd.cx as number, cmd.cy as number, cmd.r as number, 0, Math.PI * 2);
          if (cmd.fill) {
            ctx.fillStyle = cmd.color as string || '#000';
            ctx.fill();
          } else {
            ctx.strokeStyle = cmd.color as string || '#000';
            ctx.lineWidth = cmd.width as number || 2;
            ctx.stroke();
          }
          break;
        }

        case 'polygon': {
          const pts = cmd.points as Array<{ x: number; y: number }>;
          if (pts && pts.length > 2) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
            ctx.closePath();
            ctx.fillStyle = cmd.color as string || '#000';
            ctx.fill();
          }
          break;
        }

        case 'rect':
          if (cmd.fill) {
            ctx.fillStyle = cmd.color as string || '#000';
            ctx.fillRect(cmd.x as number, cmd.y as number, cmd.w as number, cmd.h as number);
          } else {
            ctx.strokeStyle = cmd.color as string || '#000';
            ctx.lineWidth = cmd.width as number || 2;
            ctx.strokeRect(cmd.x as number, cmd.y as number, cmd.w as number, cmd.h as number);
          }
          break;

        case 'text':
          ctx.fillStyle = cmd.color as string || '#fff';
          ctx.font = `${cmd.size || 16}px monospace`;
          ctx.fillText(cmd.text as string, cmd.x as number, cmd.y as number);
          break;

        case 'clear':
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, w, h);
          break;
      }
    }
  }, [data]);

  return (
    <div className="flex justify-center p-2">
      <canvas
        ref={canvasRef}
        width={canvasData.width || 600}
        height={canvasData.height || 400}
        className="rounded-lg border border-white/10 max-w-full"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}

// -- Image Renderer --

function ImageRenderer({ data }: RendererProps & { mime?: string }) {
  const src = `data:image/png;base64,${data as string}`;
  return (
    <div className="flex justify-center p-2">
      <img src={src} alt="Output" className="max-w-full max-h-[400px] rounded-lg border border-white/10" />
    </div>
  );
}

// -- HTML Renderer --

function HtmlRenderer({ data }: RendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html><head><style>
        body { margin: 8px; font-family: system-ui, sans-serif; color: #e2e8f0; background: transparent; font-size: 14px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #475569; padding: 6px 10px; text-align: left; }
        th { background: rgba(51,65,85,0.5); font-weight: 600; }
        tr:nth-child(even) { background: rgba(51,65,85,0.2); }
      </style></head><body>${data as string}</body></html>
    `);
    doc.close();
  }, [data]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className="w-full min-h-[120px] bg-transparent border-0 rounded"
      style={{ height: 'auto' }}
      onLoad={() => {
        if (iframeRef.current?.contentDocument?.body) {
          const h = iframeRef.current.contentDocument.body.scrollHeight;
          iframeRef.current.style.height = `${Math.min(h + 20, 500)}px`;
        }
      }}
    />
  );
}

// -- Text Renderer --

function TextRenderer({ data }: RendererProps) {
  return (
    <pre className="text-sm text-slate-300 whitespace-pre-wrap p-3 font-mono">
      {String(data)}
    </pre>
  );
}

// -- Renderer lookup --

function getRenderer(mime: string): React.FC<RendererProps> {
  if (mime === 'application/vnd.plotly+json') return PlotlyRenderer;
  if (mime === 'application/vnd.pylearn.canvas+json') return CanvasRenderer;
  if (mime.startsWith('image/')) return ImageRenderer;
  if (mime === 'text/html') return HtmlRenderer;
  return TextRenderer;
}

// ---------------------------------------------------------------------------
// Adventure Scene Renderer (extracted from AdventurePanel)
// ---------------------------------------------------------------------------

const BUILT_IN_BACKGROUNDS: Record<string, string> = {
  forest: 'linear-gradient(180deg, #1a3a1a 0%, #0d260d 40%, #2d5a27 70%, #1a4a1a 100%)',
  cave: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 70%, #1a1a2e 100%)',
  village: 'linear-gradient(180deg, #87CEEB 0%, #87CEEB 40%, #8B9556 70%, #6B8E23 100%)',
  dungeon: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 40%, #2a1a0a 70%, #0a0a0a 100%)',
};

interface UploadedImage {
  filename: string;
  size: number;
}

interface SceneRendererProps {
  adventureState: AdventureState;
  overrideUserId?: string;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
  onInput?: (data: string) => void;
}

const VIRTUAL_SIZE = 500;
const DEFAULT_SPRITE_SIZE = 80;

// ---------------------------------------------------------------------------
// Sprite Element — handles CSS transition with two-phase mount
// ---------------------------------------------------------------------------

interface SpriteElementProps {
  name: string;
  pos: SpriteState;
  sx: (v: number) => number; // used for image sizing only
  effectiveUserId: string | undefined;
  images: UploadedImage[];
}

function SpriteElement({ name, pos, sx, effectiveUserId, images }: SpriteElementProps) {
  // Mount at fromX/fromY so the browser paints the start position before the transition fires.
  // If there's no fromX/fromY (show event), just render at x/y with no animation.
  const [renderX, setRenderX] = useState(pos.fromX ?? pos.x);
  const [renderY, setRenderY] = useState(pos.fromY ?? pos.y);
  const [transition, setTransition] = useState<string | undefined>(undefined);
  const transitionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (transitionClearRef.current) clearTimeout(transitionClearRef.current);

    if (pos.fromX !== undefined && pos.fromY !== undefined) {
      // Phase 1: ensure element is at the from-position (already true on first mount; needed for
      // subsequent moves when the element may have drifted). React bails out if values unchanged.
      setRenderX(pos.fromX);
      setRenderY(pos.fromY);
      setTransition(undefined);
      // Phase 2: next animation frame — browser has painted at fromX/fromY, so CSS transition works
      const raf = requestAnimationFrame(() => {
        setRenderX(pos.x);
        setRenderY(pos.y);
        if (pos.duration) {
          setTransition(`left ${pos.duration}s ease-in-out, top ${pos.duration}s ease-in-out`);
          // Clear transition after animation completes so container resizes don't re-trigger it
          transitionClearRef.current = setTimeout(
            () => setTransition(undefined),
            pos.duration * 1000 + 100,
          );
        }
      });
      return () => {
        cancelAnimationFrame(raf);
        if (transitionClearRef.current) clearTimeout(transitionClearRef.current);
      };
    } else {
      // show event — immediate placement, no animation
      setRenderX(pos.x);
      setRenderY(pos.y);
      setTransition(undefined);
    }
  }, [pos.x, pos.y, pos.fromX, pos.fromY, pos.duration]);

  const nameLower = name.toLowerCase();
  const uploadedSprite = images.find((img) => {
    const filenameLower = img.filename.toLowerCase();
    const nameWithoutExt = filenameLower.replace(/\.[^.]+$/, '');
    return nameWithoutExt === nameLower || filenameLower === nameLower;
  });

  // Use percentage-based positioning so container resizes don't affect the active CSS transition.
  // Pixel-based positions change when containerSize updates (ResizeObserver), which would
  // re-trigger the transition and cause spurious y-direction animation.
  const leftPct = `${(renderX / VIRTUAL_SIZE) * 100}%`;
  const topPct  = `${(renderY / VIRTUAL_SIZE) * 100}%`;

  return (
    <div
      className="absolute"
      style={{ left: leftPct, top: topPct, transition }}
    >
      {uploadedSprite ? (
        <img
          src={`/api/adventure/uploads/${effectiveUserId}/${uploadedSprite.filename}`}
          alt={name}
          className="object-contain drop-shadow-lg"
          style={{ maxWidth: sx(pos.size ?? DEFAULT_SPRITE_SIZE), maxHeight: sx(pos.size ?? DEFAULT_SPRITE_SIZE) }}
        />
      ) : (
        <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm border border-white/30 shadow-lg">
          {name}
        </div>
      )}
    </div>
  );
}

function SceneRenderer({ adventureState, overrideUserId, isImmersive, onToggleImmersive, onInput }: SceneRendererProps) {
  const { user } = useAuth();
  const effectiveUserId = overrideUserId || user?.id;
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [newMsgIndices, setNewMsgIndices] = useState<Set<number>>(new Set());
  const prevMsgCountRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: VIRTUAL_SIZE, height: VIRTUAL_SIZE });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sx = (v: number) => (v / VIRTUAL_SIZE) * containerSize.width;
  const sy = (v: number) => (v / VIRTUAL_SIZE) * containerSize.height;

  const fetchImages = async () => {
    try {
      const url = overrideUserId
        ? `/api/adventure/images?userId=${encodeURIComponent(overrideUserId)}`
        : '/api/adventure/images';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchImages();
  }, [adventureState.background]);

  // Track newly-arrived messages for the bold animation
  useEffect(() => {
    const curr = adventureState.messages.length;
    const prev = prevMsgCountRef.current;
    if (curr > prev) {
      const added = new Set<number>();
      for (let i = prev; i < curr; i++) added.add(i);
      setNewMsgIndices(s => new Set([...s, ...added]));
    } else if (curr < prev) {
      // Scene change cleared messages — reset
      setNewMsgIndices(new Set());
    }
    prevMsgCountRef.current = curr;
  }, [adventureState.messages.length]);

  const getBackgroundStyle = (): React.CSSProperties => {
    const bg = adventureState.background;
    if (!bg) return { background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' };

    const bgLower = bg.toLowerCase();
    const uploadedMatch = images.find((img) => {
      const nameLower = img.filename.toLowerCase();
      const nameWithoutExt = nameLower.replace(/\.[^.]+$/, '');
      return nameWithoutExt === bgLower || nameLower === bgLower;
    });

    if (uploadedMatch) {
      return {
        backgroundImage: `url(/api/adventure/uploads/${effectiveUserId}/${uploadedMatch.filename})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }

    if (BUILT_IN_BACKGROUNDS[bg]) {
      return { background: BUILT_IN_BACKGROUNDS[bg] };
    }

    return { background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' };
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const immersiveInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [adventureState.messages]);

  useEffect(() => {
    if (isImmersive && adventureState.question) {
      immersiveInputRef.current?.focus();
    }
  }, [isImmersive, adventureState.question]);

  const handleImmersiveSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!onInput || !inputValue) return;
    onInput(inputValue + '\r');
    setInputValue('');
  }, [onInput, inputValue]);

  return (
    <div ref={containerRef} className="h-full relative overflow-hidden" style={getBackgroundStyle()}>
      {/* Background label */}
      {adventureState.background && (
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-black/40 backdrop-blur-sm text-white/80 text-xs px-2.5 py-1 rounded-full border border-white/10">
            {adventureState.background}
          </span>
        </div>
      )}

      {/* Immersive toggle */}
      {onToggleImmersive && (
        <div className="absolute top-3 right-3 z-10">
          <Button variant="ghost" size="sm" onClick={onToggleImmersive}
            className="text-[10px] h-6 w-6 p-0 bg-black/30 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/50 border border-white/10">
            {isImmersive ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        </div>
      )}

      {/* Sprites — key includes generation so components remount on each new run */}
      {Object.entries(adventureState.sprites).map(([name, pos]) => (
        <SpriteElement
          key={`${name}-${adventureState.generation}`}
          name={name}
          pos={pos}
          sx={sx}
          effectiveUserId={effectiveUserId}
          images={images}
        />
      ))}

      {/* Text labels */}
      {Object.entries(adventureState.texts).map(([name, t]) => (
        <div
          key={name}
          className="absolute"
          style={{
            left: sx(t.x),
            top: sy(t.y),
            fontSize: t.size,
            color: t.color,
            background: t.background ?? undefined,
            padding: t.background ? '2px 8px' : undefined,
            borderRadius: t.background ? 4 : undefined,
            fontWeight: 'bold',
            textShadow: t.background ? undefined : '0 1px 4px rgba(0,0,0,0.8)',
            whiteSpace: 'pre',
          }}
        >
          {t.text}
        </div>
      ))}

      {/* Story + Question + Input overlay */}
      {(adventureState.messages.length > 0 || adventureState.question || (isImmersive && adventureState.background)) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2 p-3 pb-4">
          {adventureState.messages.length > 0 && (
            <div className="rounded-xl px-4 py-3 max-h-36 overflow-y-auto space-y-1"
              style={{ background: 'rgba(10, 15, 30, 0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {adventureState.messages.map((msg, i) => (
                <p
                  key={i}
                  className={`leading-relaxed${i > 0 ? ' mt-1.5' : ''}${newMsgIndices.has(i) ? ' adventure-msg-new' : ''}`}
                  style={{
                    fontSize: msg.size ? `${msg.size}px` : '1rem',
                    color: msg.color ?? 'rgba(255,255,255,0.9)',
                    background: msg.background ?? undefined,
                    padding: msg.background ? '2px 6px' : undefined,
                    borderRadius: msg.background ? '4px' : undefined,
                  }}
                >{msg.text}</p>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {adventureState.question && (
            <div className="rounded-xl px-4 py-3"
              style={{
                background: adventureState.question.background ?? 'rgba(30, 60, 100, 0.60)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(100,160,255,0.2)',
              }}>
              <p className="leading-relaxed"
                style={{
                  fontSize: adventureState.question.size ? `${adventureState.question.size}px` : '1rem',
                  color: adventureState.question.color ?? '#bfdbfe',
                }}
              >{adventureState.question.text}</p>
            </div>
          )}

          {isImmersive && adventureState.question && (
            <form onSubmit={handleImmersiveSubmit}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(10, 15, 30, 0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <input
                  ref={immersiveInputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full bg-transparent px-4 py-2.5 text-sm text-white/90 placeholder:text-white/30 outline-none"
                  autoComplete="off"
                />
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Output Panel (main export)
// ---------------------------------------------------------------------------

interface OutputPanelProps {
  displayMessages: DisplayMessage[];
  adventureState: AdventureState;
  hasAdventureContent: boolean;
  isRunning?: boolean;
  overrideUserId?: string;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
  onInput?: (data: string) => void;
  onClear?: () => void;
}

export function OutputPanel({
  displayMessages,
  adventureState,
  hasAdventureContent,
  isRunning,
  overrideUserId,
  isImmersive,
  onToggleImmersive,
  onInput,
  onClear,
}: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasContent = displayMessages.length > 0 || hasAdventureContent;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [displayMessages.length]);

  // If adventure is active (has background/sprites/messages), show scene renderer
  // plus any display messages above it
  if (hasAdventureContent) {
    return (
      <div className="h-full flex flex-col">
        {/* Display messages above adventure (if any) */}
        {displayMessages.length > 0 && (
          <div className="border-b border-white/10 overflow-auto max-h-[40%]">
            <div className="p-3 space-y-3">
              {displayMessages.map((msg, i) => {
                const Renderer = getRenderer(msg.mime);
                return (
                  <div key={msg.id || i} className="rounded-lg overflow-hidden bg-slate-800/50 border border-white/5">
                    <Renderer data={msg.data} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Adventure scene takes the rest */}
        <div className="flex-1 overflow-hidden">
          <SceneRenderer
            adventureState={adventureState}
            overrideUserId={overrideUserId}
            isImmersive={isImmersive}
            onToggleImmersive={onToggleImmersive}
            onInput={onInput}
          />
        </div>
      </div>
    );
  }

  // No adventure content — show display messages or empty state
  if (!hasContent) {
    return (
      <div className="h-full flex items-center justify-center">
        {isRunning ? (
          <div className="text-center text-white/40 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-white/20 border-t-green-400 animate-spin" />
            <p className="text-base font-medium text-white/50">Running…</p>
            <p className="text-sm max-w-xs">Output will appear here.</p>
          </div>
        ) : (
          <div className="text-center text-muted-foreground space-y-3">
            <Image className="w-12 h-12 mx-auto opacity-40" />
            <p className="text-base font-medium">Output</p>
            <p className="text-sm max-w-xs">
              Run your code to see charts, drawings, and rich output here.
            </p>
            <p className="text-xs opacity-50 mt-2">
              <code className="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">import pylearn</code>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900/50">
      {/* Header with clear button */}
      {onClear && (
        <div className="flex items-center justify-end px-3 py-1 border-b border-white/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-6 text-xs text-white/40 hover:text-white/70"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
        </div>
      )}
      {/* Scrollable display messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {displayMessages.map((msg, i) => {
          const Renderer = getRenderer(msg.mime);
          return (
            <div key={msg.id || i} className="rounded-lg overflow-hidden bg-slate-800/50 border border-white/5">
              <Renderer data={msg.data} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
