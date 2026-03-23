import { create } from 'zustand';
import { ProjectFile } from '@workspace/api-client-react';

interface WorkspaceState {
  activeFileId: number | null;
  openFiles: ProjectFile[];
  unsavedChanges: Record<number, string>;
  isOutputFullscreen: boolean;
  isAiChatOpen: boolean;
  
  setActiveFile: (id: number | null) => void;
  setOpenFiles: (files: ProjectFile[]) => void;
  updateUnsavedContent: (id: number, content: string) => void;
  clearUnsavedContent: (id: number) => void;
  setFullscreen: (val: boolean) => void;
  toggleAiChat: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeFileId: null,
  openFiles: [],
  unsavedChanges: {},
  isOutputFullscreen: false,
  isAiChatOpen: true,

  setActiveFile: (id) => set({ activeFileId: id }),
  setOpenFiles: (files) => set({ openFiles: files }),
  updateUnsavedContent: (id, content) => 
    set((state) => ({ unsavedChanges: { ...state.unsavedChanges, [id]: content } })),
  clearUnsavedContent: (id) => 
    set((state) => {
      const newChanges = { ...state.unsavedChanges };
      delete newChanges[id];
      return { unsavedChanges: newChanges };
    }),
  setFullscreen: (val) => set({ isOutputFullscreen: val }),
  toggleAiChat: () => set((state) => ({ isAiChatOpen: !state.isAiChatOpen })),
}));
