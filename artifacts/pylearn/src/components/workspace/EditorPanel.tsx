import React from 'react';
import Editor from '@monaco-editor/react';
import { useWorkspaceStore } from '@/store/workspace';

interface EditorPanelProps {
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
}

export function EditorPanel({ readOnly = false, onContentChange }: EditorPanelProps) {
  const { activeFileId, openFiles, unsavedChanges, updateUnsavedContent } = useWorkspaceStore();
  
  const activeFile = openFiles.find(f => f.id === activeFileId);
  const content = activeFileId ? (unsavedChanges[activeFileId] ?? activeFile?.content ?? '') : '';

  if (!activeFileId) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        Select a file from the sidebar to start coding.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[#1e1e1e]">
      <Editor
        height="100%"
        language="python"
        theme="vs-dark"
        value={content}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'Fira Code',
          padding: { top: 16 },
          readOnly: readOnly,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          formatOnPaste: true,
        }}
        onChange={(value) => {
          if (!readOnly && value !== undefined) {
            updateUnsavedContent(activeFileId, value);
            if (onContentChange) {
              onContentChange(value);
            }
          }
        }}
      />
    </div>
  );
}
