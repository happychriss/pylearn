import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { setSessionType } from '@/lib/session-type';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useListFiles, useListStudents } from '@workspace/api-client-react';
import { EditorPanel } from '@/components/workspace/EditorPanel';
import { AiPanel } from '@/components/workspace/AiPanel';
import { Terminal } from '@/components/workspace/Terminal';
import { OutputPanel } from '@/components/workspace/OutputPanel';
import { useWorkspaceStore } from '@/store/workspace';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, FileCode, MessageSquare, Code, Monitor, ChevronDown, ChevronUp, Terminal as TerminalIcon } from 'lucide-react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useThrottledCallback } from '@/hooks/use-throttled-callback';
import { useDisplayEvents } from '@/hooks/use-display-events';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import type { Terminal as XTerm } from '@xterm/xterm';

// Shared panel header style — must match StudentWorkspace so the teacher's joint
// view looks identical to what the student sees.
const PANEL_HEADER = 'flex items-center justify-between px-3 py-2 shrink-0 bg-gradient-to-r from-[hsl(185_65%_28%)] to-primary text-primary-foreground';
const PANEL_HEADER_BTN = 'h-6 px-2 text-[11px] gap-1 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/15';

export default function AdminWorkspaceView() {
  setSessionType('admin');
  const { t } = useTranslation();
  const [, params] = useRoute('/admin/student/:id');
  const studentId = params?.id;
  const [, setLocation] = useLocation();

  const { data: students } = useListStudents();
  const student = students?.find(s => s.id.toString() === studentId);

  const { data: files } = useListFiles({ userId: studentId }, { query: { enabled: !!studentId, refetchInterval: 2000 } });

  const {
    setOpenFiles, activeFileId, setActiveFile, unsavedChanges, updateUnsavedContent,
    isAiChatOpen, toggleAiChat, clearAllUnsaved
  } = useWorkspaceStore();
  const [coEdit, setCoEdit] = useState(false);
  // Console starts hidden in visual mode so the output renders clean — same as the student view.
  const [showConsole, setShowConsole] = useState(false);
  const { emit, on } = useWebSocket('/api/ws');
  const {
    displayMessages, adventureState, hasDisplayContent, hasAdventureContent,
    setActiveTab: setDisplayActiveTab,
  } = useDisplayEvents(studentId);
  const terminalRef = useRef<XTerm | null>(null);

  // Output is always visible side-by-side (no tab) — suppress the "new event" badge permanently.
  useEffect(() => { setDisplayActiveTab('output'); }, [setDisplayActiveTab]);

  // On leaving the monitor view, drop the student's mirrored content so it doesn't
  // persist in the teacher's localStorage / bleed into the next view.
  useEffect(() => () => clearAllUnsaved(), [clearAllUnsaved]);

  // Throttled co-edit broadcast to the student (avoid full-file send per keystroke).
  const emitCoEdit = useThrottledCallback((content: string, filename: string | undefined, fileId: number) => {
    emit('co-edit-delta', { room: studentId, content, filename, fileId });
  }, 120);

  useEffect(() => {
    if (files) setOpenFiles(files);
  }, [files, setOpenFiles]);

  useEffect(() => {
    if (studentId) {
      emit('admin-join-workspace', { studentId });
      return () => {
        emit('admin-leave-workspace', { studentId });
      };
    }
  }, [studentId, emit]);

  useEffect(() => {
    const off1 = on('file-changed', (msg: Record<string, unknown>) => {
      const targetFileId = msg.fileId as number | undefined;
      if (targetFileId) {
        updateUnsavedContent(targetFileId, msg.content as string);
      }
    });

    const off2 = on('pty-output', (msg: Record<string, unknown>) => {
      if (msg.userId === studentId) {
        terminalRef.current?.write(msg.data as string);
      }
    });

    const off3 = on('pty-exit', (msg: Record<string, unknown>) => {
      if (msg.userId === studentId) {
        const exitCode = msg.exitCode as number;
        const text = exitCode === -1
          ? '\r\n\x1b[33m[Stopped]\x1b[0m\r\n'
          : `\r\n\x1b[${exitCode === 0 ? '32' : '31'}m[Exited with code ${exitCode}]\x1b[0m\r\n`;
        terminalRef.current?.write(text);
      }
    });

    return () => { off1(); off2(); off3(); };
  }, [on, studentId, updateUnsavedContent]);

  const handleEditorChange = (content: string) => {
    if (coEdit && activeFileId) {
      updateUnsavedContent(activeFileId, content);
      const filename = files?.find(f => f.id === activeFileId)?.filename;
      emitCoEdit(content, filename, activeFileId);
    }
  };

  const activeFile = files?.find(f => f.id === activeFileId);

  // Visual mode: the student's pylearn display events have arrived — show the output
  // renderer above the (read-only) console, exactly like the student's own column.
  const isVisualMode = hasDisplayContent;

  // ── Output column ──
  // Mirrors StudentWorkspace.outputColumn: visual renderer on top, collapsible
  // read-only console below. The terminal is always mounted so xterm keeps its
  // scroll buffer when the console sub-panel is toggled.
  const outputColumn = (
    <div className="h-full flex flex-col rounded-xl overflow-hidden shadow-sm bg-card">

      {/* ── Output header ── */}
      <div className={PANEL_HEADER}>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Monitor className="w-4 h-4" />
          <span>{t('admin_workspace.output')}</span>
        </div>
        {/* Console toggle only appears when there is visual output to act on */}
        {isVisualMode && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm"
              onClick={() => setShowConsole(prev => !prev)}
              className={PANEL_HEADER_BTN}>
              {showConsole
                ? <><ChevronDown className="w-3 h-3" /> {t('workspace.hide_console')}</>
                : <><ChevronUp className="w-3 h-3" /> {t('workspace.show_console')}</>
              }
            </Button>
          </div>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* Visual output renderer — only shown when pylearn events have arrived */}
        {isVisualMode && (
          <div className="relative flex-1 overflow-hidden min-h-0">
            <OutputPanel
              displayMessages={displayMessages}
              adventureState={adventureState}
              hasAdventureContent={hasAdventureContent}
              overrideUserId={studentId}
            />
          </div>
        )}

        {/* Console sub-label — thin bar between output and terminal in visual+console mode */}
        {isVisualMode && showConsole && (
          <div className="px-3 py-1 flex items-center gap-1.5 shrink-0 bg-primary/80 text-primary-foreground/80 text-xs font-medium">
            <TerminalIcon className="w-3 h-3" />
            Console
          </div>
        )}

        {/* Terminal — always mounted; height controlled by mode so xterm state is preserved.
            Read-only here: the teacher observes the student's PTY, never types into it. */}
        <div className={`relative bg-[#f0fdf4] ${
          !isVisualMode
            ? 'flex-1'                  // console-only: fills entire column
            : showConsole
              ? 'h-40 shrink-0'         // visual + console visible: fixed strip
              : 'h-0 overflow-hidden'   // visual + console hidden: collapsed
        }`}>
          <Terminal terminalRef={terminalRef} readOnly />
        </div>

      </div>
    </div>
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-[hsl(185,25%,94%)] overflow-hidden font-sans">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('admin_workspace.back')}
          </Button>
          <div className="font-display font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {t('admin_workspace.viewing', { name: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim() })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted/50 px-4 py-1.5 rounded-full border border-border flex items-center gap-3">
            <Label htmlFor="coedit-mode" className="font-semibold text-sm cursor-pointer">{t('admin_workspace.co_edit')}</Label>
            <Switch id="coedit-mode" checked={coEdit} onCheckedChange={setCoEdit} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAiChat}
            className={`rounded-xl ${isAiChatOpen ? 'bg-primary/10 text-primary' : ''}`}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex p-2 gap-2">
        {/* ── Coding Layout: Files | Code | Output — identical to the student's view ── */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            {/* Files sidebar */}
            <Panel defaultSize={15} minSize={10} maxSize={25}>
              <div className="h-full rounded-xl overflow-hidden shadow-sm bg-sidebar border border-border flex flex-col">
                <div className="p-3 border-b border-border bg-sidebar-accent/50 font-semibold text-sm shrink-0">
                  {t('admin_workspace.files')}
                </div>
                <div className="p-2 space-y-1 overflow-y-auto">
                  {files?.map(file => (
                    <div
                      key={file.id}
                      onClick={() => setActiveFile(file.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm ${
                        activeFileId === file.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-sidebar-accent'
                      }`}
                    >
                      <FileCode className="w-4 h-4 opacity-70" />
                      {file.filename}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/20 transition-colors rounded-full" />

            {/* Main: Code | Output split */}
            <Panel defaultSize={85}>
              <PanelGroup direction="horizontal">

                {/* Code Editor */}
                <Panel id="code-panel" defaultSize={50} minSize={25}>
                  <div className="h-full flex flex-col bg-card rounded-xl overflow-hidden shadow-sm">
                    <div className={PANEL_HEADER}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Code className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium">{t('admin_workspace.source_code')}</span>
                        {activeFile && (
                          <span className="text-primary-foreground/60 text-xs truncate">{activeFile.filename}</span>
                        )}
                      </div>
                      {!coEdit && (
                        <span className="shrink-0 ml-2 px-2.5 py-0.5 bg-yellow-500/90 text-white rounded-full text-[11px] font-bold shadow-sm">
                          {t('admin_workspace.read_only')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <EditorPanel readOnly={!coEdit} onContentChange={coEdit ? handleEditorChange : undefined} />
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/20 transition-colors rounded-full" />

                {/* Output column */}
                <Panel id="output-column" defaultSize={50} minSize={20}>
                  {outputColumn}
                </Panel>

              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>

        {/* AI Panel */}
        {isAiChatOpen && (
          <div className="flex shrink-0">
            <div className="w-[25%] min-w-[250px] max-w-[400px] overflow-hidden rounded-xl shadow-sm">
              <AiPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
