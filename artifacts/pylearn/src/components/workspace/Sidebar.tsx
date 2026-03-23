import React, { useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace';
import { useCreateFile, useDeleteFile } from '@workspace/api-client-react';
import { FileCode, Plus, Trash2, File as FileIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';

export function Sidebar() {
  const { openFiles, activeFileId, setActiveFile, unsavedChanges } = useWorkspaceStore();
  const createFile = useCreateFile();
  const deleteFile = useDeleteFile();
  const [newFilename, setNewFilename] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!newFilename) return;
    const name = newFilename.endsWith('.py') ? newFilename : `${newFilename}.py`;
    
    createFile.mutate({ data: { filename: name, content: '# Write your code here\n' } }, {
      onSuccess: (file) => {
        setIsDialogOpen(false);
        setNewFilename('');
        setActiveFile(file.id);
      }
    });
  };

  return (
    <div className="h-full bg-sidebar flex flex-col border-r border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/70">Files</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                onChange={e => setNewFilename(e.target.value)} 
                placeholder="filename.py"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createFile.isPending}>
                {createFile.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {openFiles.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground flex flex-col items-center">
            <FileIcon className="w-8 h-8 mb-2 opacity-20" />
            <p>No files yet.</p>
          </div>
        ) : (
          openFiles.map(file => {
            const isDirty = unsavedChanges[file.id] !== undefined;
            const isActive = activeFileId === file.id;
            
            return (
              <div 
                key={file.id}
                onClick={() => setActiveFile(file.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                  isActive 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileCode className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="truncate text-sm">{file.filename}</span>
                  {isDirty && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`w-6 h-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive ${isActive ? 'text-primary' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${file.filename}?`)) {
                      deleteFile.mutate({ id: file.id }, {
                        onSuccess: () => {
                          if (activeFileId === file.id) setActiveFile(null);
                        }
                      });
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
