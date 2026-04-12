import { create } from 'zustand';
import { ProjectFile } from '@workspace/api-client-react';

const STORAGE_KEY = 'pylearn-unsaved';

function loadUnsaved(): Record<number, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveUnsaved(changes: Record<number, string>) {
  try {
    if (Object.keys(changes).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(changes));
    }
  } catch {}
}

interface WorkspaceState {
  activeFileId: number | null;
  openFiles: ProjectFile[];
  unsavedChanges: Record<number, string>;
  isAiChatOpen: boolean;

  setActiveFile: (id: number | null) => void;
  setOpenFiles: (files: ProjectFile[]) => void;
  updateUnsavedContent: (id: number, content: string) => void;
  clearUnsavedContent: (id: number) => void;
  toggleAiChat: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeFileId: null,
  openFiles: [],
  unsavedChanges: loadUnsaved(),
  isAiChatOpen: true,

  setActiveFile: (id) => set({ activeFileId: id }),
  setOpenFiles: (files) => set({ openFiles: files }),
  updateUnsavedContent: (id, content) =>
    set((state) => {
      const next = { ...state.unsavedChanges, [id]: content };
      saveUnsaved(next);
      return { unsavedChanges: next };
    }),
  clearUnsavedContent: (id) =>
    set((state) => {
      const next = { ...state.unsavedChanges };
      delete next[id];
      saveUnsaved(next);
      return { unsavedChanges: next };
    }),
  toggleAiChat: () => set((state) => ({ isAiChatOpen: !state.isAiChatOpen })),
}));
