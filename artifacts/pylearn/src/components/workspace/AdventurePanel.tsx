import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@workspace/auth-web';
import { Upload, Trash2, Image, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { AdventureState } from '@/hooks/use-adventure-events';

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

interface AdventurePanelProps {
  adventureState: AdventureState;
  overrideUserId?: string;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
  onInput?: (data: string) => void;
}

export function AdventurePanel({ adventureState, overrideUserId, isImmersive, onToggleImmersive, onInput }: AdventurePanelProps) {
  const { user } = useAuth();
  const effectiveUserId = overrideUserId || user?.id;
  const isReadOnly = !!overrideUserId;
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } catch {
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File must be under 2 MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/adventure/images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'Uploaded!', description: `${file.name} is ready to use.` });
        fetchImages();
      } else {
        const err = await res.json();
        toast({ title: 'Upload failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      const res = await fetch(`/api/adventure/images/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.filename !== filename));
        toast({ title: 'Deleted', description: `${filename} removed.` });
      }
    } catch {
    }
  };

  const getBackgroundStyle = (): React.CSSProperties => {
    const bg = adventureState.background;
    if (!bg) return { background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' };

    const uploadedMatch = images.find((img) => {
      const nameWithoutExt = img.filename.replace(/\.[^.]+$/, '');
      return nameWithoutExt === bg || img.filename === bg;
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

  // Auto-focus the immersive input when a question appears
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
    <div className="h-full relative overflow-hidden" style={getBackgroundStyle()}>

      {/* Empty state */}
      {!adventureState.background && Object.keys(adventureState.sprites).length === 0 && adventureState.messages.length === 0 && !adventureState.question && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white/50 space-y-3">
            <Image className="w-16 h-16 mx-auto opacity-50" />
            <p className="text-lg font-medium">Adventure Preview</p>
            <p className="text-sm max-w-xs">
              Run code with <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">from adventure import scene, say, show</code> to see your story here.
            </p>
          </div>
        </div>
      )}

      {/* Background label */}
      {adventureState.background && (
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-black/40 backdrop-blur-sm text-white/80 text-xs px-2.5 py-1 rounded-full border border-white/10">
            {adventureState.background}
          </span>
        </div>
      )}

      {/* Top-right buttons: upload + immersive toggle */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {!isReadOnly && (
          <>
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleUpload} />
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-[10px] h-6 px-2 bg-black/30 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/50 border border-white/10">
              <Upload className="w-3 h-3 mr-1" />
              {uploading ? '…' : 'Image'}
            </Button>
          </>
        )}
        {onToggleImmersive && (
          <Button variant="ghost" size="sm" onClick={onToggleImmersive}
            className="text-[10px] h-6 w-6 p-0 bg-black/30 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/50 border border-white/10">
            {isImmersive ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        )}
      </div>

      {/* Sprites */}
      {Object.entries(adventureState.sprites).map(([name, pos]) => {
        const uploadedSprite = images.find((img) => {
          const nameWithoutExt = img.filename.replace(/\.[^.]+$/, '');
          return nameWithoutExt === name || img.filename === name;
        });
        return (
          <div key={name} className="absolute" style={{ left: pos.x, top: pos.y }}>
            {uploadedSprite ? (
              <img
                src={`/api/adventure/uploads/${effectiveUserId}/${uploadedSprite.filename}`}
                alt={name}
                className="max-w-[120px] max-h-[120px] object-contain drop-shadow-lg"
              />
            ) : (
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm border border-white/30 shadow-lg">
                {name}
              </div>
            )}
          </div>
        );
      })}

      {/* Story + Question + Input overlay at the bottom */}
      {(adventureState.messages.length > 0 || adventureState.question || (isImmersive && adventureState.background)) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2 p-3">

          {/* Story box */}
          {adventureState.messages.length > 0 && (
            <div className="rounded-xl px-4 py-3 max-h-36 overflow-y-auto space-y-1"
              style={{ background: 'rgba(10, 15, 30, 0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {adventureState.messages.map((msg, i) => (
                <p key={i} className="text-sm text-white/90 leading-relaxed">{msg}</p>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Question box */}
          {adventureState.question && (
            <div className="rounded-xl px-4 py-3"
              style={{ background: 'rgba(30, 60, 100, 0.60)', backdropFilter: 'blur(12px)', border: '1px solid rgba(100,160,255,0.2)' }}>
              <p className="text-sm text-blue-100 leading-relaxed">{adventureState.question}</p>
            </div>
          )}

          {/* Immersive input bar */}
          {isImmersive && adventureState.question && (
            <form onSubmit={handleImmersiveSubmit}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(10, 15, 30, 0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <input
                  ref={immersiveInputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your answer…"
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
