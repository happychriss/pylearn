import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@workspace/auth-web';
import { Upload, Trash2, Image } from 'lucide-react';
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
}

export function AdventurePanel({ adventureState, overrideUserId }: AdventurePanelProps) {
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

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex-1 relative overflow-hidden" style={getBackgroundStyle()}>
        {!adventureState.background && Object.keys(adventureState.sprites).length === 0 && !adventureState.dialogue && (
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

        {adventureState.background && (
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-black/50 backdrop-blur-sm text-white/90 text-xs font-medium px-2.5 py-1 rounded-full border border-white/20">
              {adventureState.background}
            </span>
          </div>
        )}

        {Object.entries(adventureState.sprites).map(([name, pos]) => {
          const uploadedSprite = images.find((img) => {
            const nameWithoutExt = img.filename.replace(/\.[^.]+$/, '');
            return nameWithoutExt === name || img.filename === name;
          });

          return (
            <div
              key={name}
              className="absolute"
              style={{ left: pos.x, top: pos.y }}
            >
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
      </div>

      {adventureState.dialogue && (
        <div className="px-4 py-3 bg-slate-900 border-t border-white/10">
          <div className="text-white text-base leading-relaxed">
            {adventureState.dialogue}
          </div>
        </div>
      )}

      <div className="border-t border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isReadOnly ? "Student Images" : "My Images"}
          </span>
          {!isReadOnly && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs h-7 rounded-lg"
              >
                <Upload className="w-3 h-3 mr-1" />
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          )}
        </div>
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">
            {isReadOnly ? "No images uploaded by this student." : "No images uploaded yet. Upload backgrounds and sprites to use in your adventure!"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
            {images.map((img) => (
              <div
                key={img.filename}
                className="group relative flex items-center gap-1.5 bg-background rounded-md px-2 py-1 border border-border text-xs"
              >
                <img
                  src={`/api/adventure/uploads/${effectiveUserId}/${img.filename}`}
                  alt={img.filename}
                  className="w-6 h-6 object-cover rounded"
                />
                <span className="truncate max-w-[80px]">{img.filename}</span>
                {!isReadOnly && (
                  <button
                    onClick={() => handleDelete(img.filename)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
