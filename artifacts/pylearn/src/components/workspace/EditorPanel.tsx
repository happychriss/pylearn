import React from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useWorkspaceStore } from '@/store/workspace';
import type { editor as MonacoEditor } from 'monaco-editor';

interface EditorPanelProps {
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
  onEditorMount?: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
}

export function EditorPanel({ readOnly = false, onContentChange, onEditorMount }: EditorPanelProps) {
  const { activeFileId, openFiles, unsavedChanges, updateUnsavedContent } = useWorkspaceStore();

  const activeFile = openFiles.find(f => f.id === activeFileId);
  const content = activeFileId !== null ? (unsavedChanges[activeFileId] ?? activeFile?.content ?? '') : '';

  if (!activeFileId) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        Select a file from the sidebar to start coding.
      </div>
    );
  }

  const handleMount: OnMount = (editorInstance) => {
    onEditorMount?.(editorInstance);
  };

  return (
    <div className="h-full w-full overflow-hidden bg-white">
      <Editor
        height="100%"
        language="python"
        theme="vs"
        // path gives each file its own Monaco model and its own isolated undo stack.
        // Switching files no longer bleeds undo history across files.
        path={`file-${activeFileId}`}
        value={content}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'Fira Code',
          padding: { top: 16, bottom: 8 },
          readOnly,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          formatOnPaste: true,
        }}
        onMount={handleMount}
        onChange={(value) => {
          if (!readOnly && value !== undefined) {
            updateUnsavedContent(activeFileId, value);
            onContentChange?.(value);
          }
        }}
      />
    </div>
  );
}
