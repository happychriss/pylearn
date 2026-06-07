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
  clearAllUnsaved: () => void;
  updateOpenFileContent: (id: number, content: string) => void;
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
  // Wipe all unsaved edits + their localStorage copy. Called on logout and when
  // leaving the teacher monitor view so one user's draft code can't linger on a
  // shared device or bleed into the next session.
  clearAllUnsaved: () => {
    saveUnsaved({});
    set({ unsavedChanges: {} });
  },
  updateOpenFileContent: (id, content) =>
    set((state) => ({
      openFiles: state.openFiles.map(f => f.id === id ? { ...f, content } : f),
    })),
  toggleAiChat: () => set((state) => ({ isAiChatOpen: !state.isAiChatOpen })),
}));
