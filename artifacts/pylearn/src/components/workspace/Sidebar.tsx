import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace';
import { useCreateFile, useDeleteFile } from '@workspace/api-client-react';
import { FileCode, Plus, Trash2, File as FileIcon, Image, Upload, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../ui/dialog';
import { toast } from '@/hooks/use-toast';

interface UploadedImage {
  filename: string;
  size: number;
}

interface SidebarProps {
  onFileSelect?: () => void;
  aiMode?: string;
  onPromptSelect?: (content: string) => void;
}

export function Sidebar({ onFileSelect, aiMode, onPromptSelect }: SidebarProps) {
  const { openFiles, activeFileId, setActiveFile, unsavedChanges } = useWorkspaceStore();
  const createFile = useCreateFile();
  const deleteFile = useDeleteFile();
  const [newFilename, setNewFilename] = useState('');
  const [createError, setCreateError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const [pendingFilename, setPendingFilename] = useState<string | null>(null);

  // Clear create spinner once the new file actually appears in the file list
  useEffect(() => {
    if (pendingFilename && openFiles.some(f => f.filename === pendingFilename)) {
      setCreatingFile(false);
      setPendingFilename(null);
    }
  }, [openFiles, pendingFilename]);

  // Clear delete spinner once the file actually disappears from the file list
  useEffect(() => {
    if (deletingFileId !== null && !openFiles.some(f => f.id === deletingFileId)) {
      setDeletingFileId(null);
    }
  }, [openFiles, deletingFileId]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; filename: string } | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = async () => {
    try {
      const res = await fetch('/api/adventure/images', { credentials: 'include' });
      if (res.ok) setImages(await res.json());
    } catch {}
  };

  useEffect(() => { fetchImages(); }, []);

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/adventure/images', { method: 'POST', body: formData, credentials: 'include' });
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
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleDeleteImage = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      const res = await fetch(`/api/adventure/images/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setImages(prev => prev.filter(img => img.filename !== filename));
        toast({ title: 'Deleted', description: `${filename} removed.` });
      }
    } catch {}
  };

  const handleCreate = async () => {
    if (!newFilename) return;
    const name = newFilename.endsWith('.py') ? newFilename : `${newFilename}.py`;

    if (openFiles.some(f => f.filename === name)) {
      setCreateError(`"${name}" already exists`);
      return;
    }
    // Close dialog immediately — spinner row stays until file appears in list
    setIsDialogOpen(false);
    setNewFilename('');
    setCreateError('');
    setCreatingFile(true);
    setPendingFilename(name);
    createFile.mutate({ data: { filename: name, content: '# Write your code here\n' } }, {
      onSuccess: (file) => {
        setActiveFile(file.id);
        // creatingFile cleared by useEffect when openFiles updates
      },
      onError: () => { setCreatingFile(false); setPendingFilename(null); },
    });
  };

  return (
    <div className="h-full bg-sidebar flex flex-col border-r border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/70">
          {aiMode === 'chat' ? 'Prompts' : 'Files'}
        </h2>
        {aiMode !== 'chat' && <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setNewFilename(''); setCreateError(''); } }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-sidebar-accent">
              <Plus className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New File</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <Input
                value={newFilename}
                onChange={e => { setNewFilename(e.target.value); setCreateError(''); }}
                placeholder="filename.py"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createFile.isPending}>
                {createFile.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating…</>
                  : "Create"}
              </Button>
            </div>
            {createError && <p className="text-sm text-destructive mt-1">{createError}</p>}
          </DialogContent>
        </Dialog>}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {(() => {
          const isChatMode = aiMode === 'chat';
          const filteredFiles = openFiles.filter(f =>
            isChatMode ? f.filename.endsWith('.prompt') : !f.filename.endsWith('.prompt')
          );

          if (filteredFiles.length === 0 && !creatingFile) {
            return (
              <div className="text-center p-4 text-sm text-muted-foreground flex flex-col items-center">
                {isChatMode ? (
                  <>
                    <MessageCircle className="w-8 h-8 mb-2 opacity-20" />
                    <p>No prompts yet.</p>
                    <p className="text-xs mt-1">Your teacher will assign prompts.</p>
                  </>
                ) : (
                  <>
                    <FileIcon className="w-8 h-8 mb-2 opacity-20" />
                    <p>No files yet.</p>
                  </>
                )}
              </div>
            );
          }

          return <>
            {creatingFile && !isChatMode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="truncate text-sm italic">Creating…</span>
              </div>
            )}
            {filteredFiles.map(file => {
            const isDirty = unsavedChanges[file.id] !== undefined;
            const isActive = activeFileId === file.id;
            const isPrompt = file.filename.endsWith('.prompt');
            const displayName = isPrompt ? file.filename.replace(/\.prompt$/, '') : file.filename;

            return (
              <div
                key={file.id}
                onClick={() => {
                  if (isPrompt && onPromptSelect) {
                    onPromptSelect(file.content);
                  } else {
                    setActiveFile(file.id);
                    onFileSelect?.();
                  }
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                  isActive && !isPrompt
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {isPrompt ? (
                    <MessageCircle className="w-4 h-4 shrink-0 text-accent" />
                  ) : (
                    <FileCode className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                  <span className="truncate text-sm">{displayName}</span>
                  {isDirty && !isPrompt && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`w-6 h-6 hover:bg-destructive/10 hover:text-destructive ${deletingFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${isActive ? 'text-primary' : ''}`}
                  disabled={deletingFileId === file.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: file.id, filename: file.filename });
                  }}
                >
                  {deletingFileId === file.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            );
            })}
          </>;
        })()}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Delete <span className="font-mono font-medium">{deleteTarget?.filename}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deletingFileId === deleteTarget?.id}
              onClick={() => {
                if (!deleteTarget) return;
                setDeletingFileId(deleteTarget.id);
                setDeleteTarget(null);
                deleteFile.mutate({ id: deleteTarget.id }, {
                  onSuccess: () => {
                    if (activeFileId === deleteTarget.id) setActiveFile(null);
                    // deletingFileId cleared by useEffect when file leaves openFiles
                  },
                  onError: () => setDeletingFileId(null),
                });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Images section — hidden in chat mode */}
      {aiMode !== 'chat' && <div className="border-t border-border shrink-0">
        <div className="p-4 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/70">Images</h2>
          <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleUploadImage} />
          <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-sidebar-accent" onClick={() => imageInputRef.current?.click()} disabled={uploading} title="Upload image">
            <Upload className="w-4 h-4" />
          </Button>
        </div>
        {images.length > 0 && (
          <div className="px-2 pb-2 space-y-1 max-h-40 overflow-y-auto">
            {images.map(img => (
              <div key={img.filename} className="flex items-center justify-between px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent group">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Image className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{img.filename}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteImage(img.filename)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {images.length === 0 && (
          <p className="px-4 pb-2 text-xs text-muted-foreground">No images yet.</p>
        )}
        <div className="h-3 shrink-0" />
      </div>}
    </div>
  );
}
