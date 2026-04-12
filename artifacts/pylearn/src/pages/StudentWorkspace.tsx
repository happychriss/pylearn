import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/auth-web';
import { setSessionType } from '@/lib/session-type';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Sidebar } from '@/components/workspace/Sidebar';
import { EditorPanel } from '@/components/workspace/EditorPanel';
import { AiPanel } from '@/components/workspace/AiPanel';
import { AiChatPanel } from '@/components/workspace/AiChatPanel';
import { Terminal } from '@/components/workspace/Terminal';
import { OutputPanel } from '@/components/workspace/OutputPanel';
import { useListFiles, useUpdateFile, useCreateHelpRequest, useGetMyProfile, useGetStudentAiConfig } from '@workspace/api-client-react';
import { useWorkspaceStore } from '@/store/workspace';
import { Button } from '@/components/ui/button';
import { Play, Square, Save, Maximize2, Minimize2, ChevronDown, ChevronUp, Hand, MessageSquare, Code, Monitor, Terminal as TerminalIcon, LogOut, Wifi, WifiOff } from 'lucide-react';
import { usePtySession } from '@/hooks/use-pty-session';
import { useWebSocket } from '@/hooks/use-websocket';
import { useDisplayEvents } from '@/hooks/use-display-events';
import { toast } from '@/hooks/use-toast';
import { APP_VERSION } from '@/lib/version';
import type { Terminal as XTerm } from '@xterm/xterm';

type FullscreenPanel = 'code' | null;

// Shared panel header style — gradient from deep teal to primary
const PANEL_HEADER = 'flex items-center justify-between px-3 py-2 shrink-0 bg-gradient-to-r from-[hsl(185_65%_28%)] to-primary text-primary-foreground';
const PANEL_HEADER_BTN = 'h-6 px-2 text-[11px] gap-1 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/15';

export default function StudentWorkspace() {
  setSessionType('student');
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { data: profile, refetch: refetchProfile } = useGetMyProfile({ query: { enabled: isAuthenticated } });
  const { data: files } = useListFiles({}, { query: { enabled: isAuthenticated, refetchInterval: 5000 } });
  const { data: aiConfig } = useGetStudentAiConfig({ query: { enabled: isAuthenticated, refetchInterval: 10000 } });
  const updateFile = useUpdateFile();
  const helpReq = useCreateHelpRequest();

  const {
    setOpenFiles,
    activeFileId,
    unsavedChanges,
    clearUnsavedContent,
    isAiChatOpen,
    toggleAiChat,
    updateUnsavedContent,
  } = useWorkspaceStore();

  const { isRunning, runCode, sendInput, stopCode, listen } = usePtySession();
  const {
    displayMessages, adventureState, hasDisplayContent, hasAdventureContent,
    clearQuestion, resetState: resetDisplay, setActiveTab: setDisplayActiveTab,
  } = useDisplayEvents();

  // Output is always visible — suppress "new event" badge permanently
  useEffect(() => { setDisplayActiveTab('output'); }, [setDisplayActiveTab]);

  // Clear the adventure question prompt when code stops running
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      clearQuestion();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, clearQuestion]);

  const [teacherViewing, setTeacherViewing] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [modeChangedWhileActive, setModeChangedWhileActive] = useState(false);
  // showConsole only matters when isVisualMode — starts hidden so output is clean on first display event
  const [showConsole, setShowConsole] = useState(false);
  const [consoleHasOutput, setConsoleHasOutput] = useState(false);
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null);
  const [isPresenting, setIsPresenting] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const aiResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { emit, on, onConnect, status: wsStatus } = useWebSocket('/api/ws');
  const terminalRef = useRef<XTerm | null>(null);
  const outputPresentRef = useRef<HTMLDivElement>(null);

  // Track browser fullscreen state (ESC key or other exit paths)
  useEffect(() => {
    const handler = () => setIsPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (files) setOpenFiles(files);
  }, [files, setOpenFiles]);

  useEffect(() => {
    if (!user?.id) return;
    const rejoin = () => emit('join-room', { room: user.id });
    rejoin();
    const cleanup = onConnect(rejoin);
    return cleanup;
  }, [user?.id, emit, onConnect]);

  useEffect(() => {
    const cleanup = listen(
      (data) => {
        terminalRef.current?.write(data);
        setConsoleHasOutput(true);
      },
      (exitCode) => {
        const msg = exitCode === -1
          ? '\r\n\x1b[33m[Stopped]\x1b[0m\r\n'
          : `\r\n\x1b[${exitCode === 0 ? '32' : '31'}m[Exited with code ${exitCode}]\x1b[0m\r\n`;
        terminalRef.current?.write(msg);
        setConsoleHasOutput(true);
      }
    );
    return cleanup;
  }, [listen]);

  useEffect(() => {
    const off1 = on('admin-joined', () => setTeacherViewing(true));
    const off2 = on('admin-left', () => setTeacherViewing(false));
    const off3 = on('co-edit-delta', (msg: Record<string, unknown>) => {
      const targetFileId = msg.fileId as number | undefined;
      if (msg.userId !== user?.id && targetFileId) {
        updateUnsavedContent(targetFileId, msg.content as string);
      }
    });
    const off4 = on('file-changed', (msg: Record<string, unknown>) => {
      const targetFileId = msg.fileId as number | undefined;
      if (msg.userId !== user?.id && targetFileId) {
        updateUnsavedContent(targetFileId, msg.content as string);
      }
    });
    const off5 = on('ai-mode-changed', () => setModeChangedWhileActive(true));
    return () => { off1(); off2(); off3(); off4(); off5(); };
  }, [on, user?.id, updateUnsavedContent]);

  if (isLoading) {
    return <div className="h-dvh w-full flex items-center justify-center bg-background text-muted-foreground">Loading...</div>;
  }
  if (!isAuthenticated) return null;

  if (modeChangedWhileActive) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-background px-4">
        <div className="p-8 rounded-2xl bg-card border shadow-lg text-center max-w-sm w-full">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Classroom mode changed</h2>
          <p className="text-muted-foreground mb-6">
            Your teacher has updated the classroom settings. Please log out and sign back in to continue.
          </p>
          <Button
            onClick={async () => {
              await fetch('/api/auth/student-logout', { method: 'POST', credentials: 'include' });
              window.location.href = '/';
            }}
            className="w-full rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" /> Log out
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await fetch('/api/auth/student-logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  };

  const handleAiPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    aiResizeRef.current = { startX: e.clientX, startWidth: aiPanelWidth };
    const onMove = (e: MouseEvent) => {
      if (!aiResizeRef.current) return;
      const delta = aiResizeRef.current.startX - e.clientX;
      setAiPanelWidth(Math.max(220, Math.min(600, aiResizeRef.current.startWidth + delta)));
    };
    const onUp = () => {
      aiResizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleSave = () => {
    if (!activeFileId || !unsavedChanges[activeFileId]) return;
    updateFile.mutate({
      id: activeFileId,
      data: { content: unsavedChanges[activeFileId] }
    }, {
      onSuccess: () => {
        clearUnsavedContent(activeFileId);
        toast({ title: "Saved!", description: "File saved successfully." });
      }
    });
  };

  const handleRun = () => {
    const activeFile = files?.find(f => f.id === activeFileId);
    const content = activeFileId ? (unsavedChanges[activeFileId] ?? activeFile?.content ?? '') : '';
    if (!content) return;
    terminalRef.current?.clear();
    setConsoleHasOutput(false);
    setShowConsole(false); // Console starts hidden; show it explicitly when needed
    resetDisplay();        // Clears display content → switches to console-only mode
    runCode(content);
  };

  const handleHelp = () => {
    helpReq.mutate({ data: { message: "I'm stuck on my code!" } }, {
      onSuccess: () => {
        emit('help-requested', { message: "I'm stuck on my code!" });
        toast({ title: "Help Requested", description: "The teacher has been notified." });
      }
    });
  };

  const handleEditorChange = (content: string) => {
    if (activeFileId) {
      updateUnsavedContent(activeFileId, content);
      const filename = files?.find(f => f.id === activeFileId)?.filename;
      emit('file-changed', { room: user?.id, content, filename, fileId: activeFileId });
    }
  };

  const handlePresent = () => {
    outputPresentRef.current?.requestFullscreen();
  };

  const activeFile = files?.find(f => f.id === activeFileId);
  const isDirty = activeFileId ? unsavedChanges[activeFileId] !== undefined : false;
  const isChatMode = aiConfig?.mode === 'chat';
  const isAiEnabled = aiConfig?.mode !== 'off';
  const aiCredits = (profile as Record<string, unknown> | undefined)?.aiCredits as number | undefined;
  const showAiPanel = isAiEnabled && isAiChatOpen && fullscreenPanel === null;

  // Visual mode: pylearn display events have arrived — show output renderer above terminal
  const isVisualMode = hasDisplayContent;

  // ── Output column ──
  // The terminal is always mounted (never unmounted) so xterm preserves its scroll
  // buffer even when the console sub-panel is toggled or hidden.
  const outputColumn = (
    <div className="h-full flex flex-col rounded-xl overflow-hidden shadow-sm bg-card">

      {/* ── Output header ── */}
      <div className={PANEL_HEADER}>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Monitor className="w-4 h-4" />
          <span>Output</span>
          {isRunning && <span className="text-green-300 animate-pulse text-xs ml-1">● Running</span>}
        </div>
        {/* Buttons only appear when there is visual output to act on */}
        {isVisualMode && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm"
              onClick={() => setShowConsole(prev => !prev)}
              className={PANEL_HEADER_BTN}>
              {showConsole
                ? <><ChevronDown className="w-3 h-3" /> Hide console</>
                : <><ChevronUp className="w-3 h-3" /> Show console</>
              }
            </Button>
            <Button variant="ghost" size="sm"
              onClick={handlePresent}
              className={PANEL_HEADER_BTN}>
              <Maximize2 className="w-3 h-3" /> Present
            </Button>
          </div>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* Visual output renderer — only shown when pylearn events have arrived */}
        {isVisualMode && (
          <div ref={outputPresentRef} className="relative flex-1 overflow-hidden min-h-0">
            <OutputPanel
              displayMessages={displayMessages}
              adventureState={adventureState}
              hasAdventureContent={hasAdventureContent}
              isRunning={isRunning}
              onInput={sendInput}
              onClear={resetDisplay}
            />
            {/* Exit button — shown only during browser fullscreen (ESC also works) */}
            {isPresenting && (
              <button
                onClick={() => document.exitFullscreen()}
                className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white bg-black/40 hover:bg-black/60 border border-white/20 backdrop-blur-sm transition-colors"
              >
                <Minimize2 className="w-4 h-4" /> Exit
              </button>
            )}
          </div>
        )}

        {/* Console sub-label — thin bar between output and terminal in visual+console mode */}
        {isVisualMode && showConsole && (
          <div className="px-3 py-1 flex items-center gap-1.5 shrink-0 bg-primary/80 text-primary-foreground/80 text-xs font-medium">
            <TerminalIcon className="w-3 h-3" />
            Console
          </div>
        )}

        {/* Terminal — always mounted; height controlled by mode so xterm state is preserved */}
        <div className={`relative bg-[#f0fdf4] ${
          !isVisualMode
            ? 'flex-1'                  // console-only: fills entire column
            : showConsole
              ? 'h-40 shrink-0'         // visual + console visible: fixed strip
              : 'h-0 overflow-hidden'   // visual + console hidden: collapsed
        }`}>
          {/* Empty state — only in console-only mode before any output */}
          {!isVisualMode && !consoleHasOutput && !isRunning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 pointer-events-none">
              <TerminalIcon className="w-10 h-10 text-green-400" />
              <p className="text-sm font-medium text-green-700">Console is empty</p>
              <p className="text-xs text-green-600/70 max-w-[220px] leading-relaxed">
                When your code uses <code className="bg-green-100 px-1 rounded">print()</code>, the text appears here.
              </p>
            </div>
          )}
          <Terminal terminalRef={terminalRef} onInput={sendInput} />
        </div>

      </div>
    </div>
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-[hsl(185,25%,94%)] overflow-hidden font-sans">
      {/* ── App header ── */}
      <header className="h-14 border-b border-primary/20 flex items-center justify-between px-4 shrink-0 shadow-sm relative z-10" style={{ background: 'linear-gradient(to right, hsl(185, 50%, 93%), white)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="font-display font-bold text-lg text-primary tracking-tight">PyLearn</div>
            <span className="text-[10px] text-muted-foreground font-mono">{APP_VERSION}</span>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {((profile?.firstName ?? (user as { firstName?: string } | null)?.firstName ?? 'S')[0] ?? 'S').toUpperCase()}
            </div>
            <span className="font-semibold text-sm text-foreground">
              {[profile?.firstName ?? (user as { firstName?: string } | null)?.firstName, profile?.lastName ?? (user as { lastName?: string } | null)?.lastName].filter(Boolean).join(' ') || 'Student'}
            </span>
            {wsStatus === 'connected' ? (
              <Wifi size={14} className="text-green-500" title="Connected" />
            ) : (
              <WifiOff size={14} className="text-red-400 animate-pulse" title="Connecting…" />
            )}
          </div>
          {aiConfig?.mode && (
            <div className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              {aiConfig.mode === 'chat' ? 'Chat Mode' : aiConfig.mode === 'agent' ? 'Agent Mode' : 'Suggest Mode'}
            </div>
          )}
          {teacherViewing && (
            <div className="px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Teacher is viewing
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleHelp}
            disabled={helpReq.isPending}
            className="rounded-xl border-accent text-accent hover:bg-accent hover:text-accent-foreground"
          >
            <Hand className="w-4 h-4 mr-2" /> Need Help
          </Button>

          {!isChatMode && isAiEnabled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAiChat}
              className={`rounded-xl ${isAiChatOpen ? 'bg-primary/10 text-primary' : ''}`}
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          )}

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="rounded-xl text-muted-foreground hover:text-destructive"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex p-2 gap-2">
        {isChatMode ? (
          /* ── Chat Mode Layout ── */
          <div className="flex-1 overflow-hidden">
            <PanelGroup direction="horizontal">
              <Panel defaultSize={15} minSize={10} maxSize={25}>
                <Sidebar
                  aiMode="chat"
                  onPromptSelect={(content) => setPendingPrompt(content)}
                />
              </Panel>
              <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/20 transition-colors rounded-full" />
              <Panel defaultSize={85}>
                <AiChatPanel
                  credits={aiCredits ?? 0}
                  onCreditUsed={() => refetchProfile()}
                  initialPrompt={pendingPrompt ?? undefined}
                  onPromptConsumed={() => setPendingPrompt(null)}
                />
              </Panel>
            </PanelGroup>
          </div>
        ) : (
          /* ── Normal Coding Layout: Sidebar | Code | Output ── */
          <>
            <div className="flex-1 overflow-hidden">
              <PanelGroup direction="horizontal">
                {/* Sidebar */}
                <Panel defaultSize={15} minSize={10} maxSize={25}>
                  <div className="h-full rounded-xl overflow-hidden shadow-sm">
                    <Sidebar onFileSelect={() => {}} aiMode={aiConfig?.mode} />
                  </div>
                </Panel>

                <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/20 transition-colors rounded-full" />

                {/* Main: Code | Output split */}
                <Panel defaultSize={85}>
                  <PanelGroup direction="horizontal">

                    {/* Code Editor — hidden when code is fullscreened */}
                    <Panel id="code-panel" defaultSize={fullscreenPanel === 'code' ? 100 : 50} minSize={25}>
                      <div className="h-full flex flex-col bg-card rounded-xl overflow-hidden shadow-sm">
                        <div className={PANEL_HEADER}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Code className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-medium">Source Code</span>
                            {activeFile && (
                              <span className="text-primary-foreground/60 text-xs truncate">
                                {activeFile.filename}{isDirty && ' •'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {!isChatMode && (
                              <>
                                <Button variant="ghost" size="sm"
                                  onClick={handleSave}
                                  disabled={!isDirty || updateFile.isPending}
                                  className={PANEL_HEADER_BTN}>
                                  <Save className="w-3 h-3" /> Save
                                </Button>
                                {isRunning ? (
                                  <Button size="sm" onClick={stopCode}
                                    className="h-6 px-2 text-[11px] gap-1 bg-red-500 hover:bg-red-600 text-white border-0">
                                    <Square className="w-3 h-3" /> Stop
                                  </Button>
                                ) : (
                                  <Button size="sm" onClick={handleRun}
                                    disabled={!activeFileId}
                                    className="h-6 px-2 text-[11px] gap-1 bg-green-500 hover:bg-green-600 text-white border-0">
                                    <Play className="w-3 h-3" /> Run
                                  </Button>
                                )}
                                <div className="w-px h-4 bg-white/20 mx-0.5" />
                              </>
                            )}
                            {fullscreenPanel === 'code' ? (
                              <Button variant="ghost" size="sm" onClick={() => setFullscreenPanel(null)}
                                className={PANEL_HEADER_BTN}>
                                <Minimize2 className="w-3 h-3" /> Exit full screen
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => setFullscreenPanel('code')}
                                className={PANEL_HEADER_BTN}>
                                <Maximize2 className="w-3 h-3" /> Full screen
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <EditorPanel onContentChange={handleEditorChange} />
                        </div>
                      </div>
                    </Panel>

                    {fullscreenPanel === null && (
                      <PanelResizeHandle className="w-2 bg-transparent hover:bg-primary/20 transition-colors rounded-full" />
                    )}

                    {/* Output column — hidden when code is fullscreened */}
                    {fullscreenPanel !== 'code' && (
                      <Panel id="output-column" defaultSize={50} minSize={20}>
                        {outputColumn}
                      </Panel>
                    )}

                  </PanelGroup>
                </Panel>
              </PanelGroup>
            </div>

            {/* AI Panel */}
            {showAiPanel && (
              <div className="flex shrink-0">
                <div
                  className="w-2 bg-transparent hover:bg-primary/20 transition-colors cursor-col-resize shrink-0 rounded-full"
                  onMouseDown={handleAiPanelResizeStart}
                />
                <div style={{ width: aiPanelWidth }} className="overflow-hidden rounded-xl shadow-sm">
                  <AiPanel credits={aiCredits ?? 0} onCreditUsed={() => refetchProfile()} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
