import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/auth-web';
import { setSessionType } from '@/lib/session-type';

// Set session type before any hooks fire
setSessionType('student');
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
import { Play, Square, Save, Maximize2, Minimize2, Hand, MessageSquare, Code, Monitor, LogOut, Wifi, WifiOff } from 'lucide-react';
import { usePtySession } from '@/hooks/use-pty-session';
import { useWebSocket } from '@/hooks/use-websocket';
import { useDisplayEvents } from '@/hooks/use-display-events';
import { toast } from '@/hooks/use-toast';
import { APP_VERSION } from '@/lib/version';
import type { Terminal as XTerm } from '@xterm/xterm';

type ActiveTab = 'code' | 'output';

export default function StudentWorkspace() {
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
    isOutputFullscreen,
    setFullscreen,
    isAiChatOpen,
    toggleAiChat,
    updateUnsavedContent,
  } = useWorkspaceStore();

  const { isRunning, runCode, sendInput, stopCode, listen } = usePtySession();
  const {
    displayMessages, adventureState, hasNewEvent, hasDisplayContent, hasAdventureContent,
    clearNewEvent, resetState: resetDisplay, setActiveTab: setDisplayActiveTab,
  } = useDisplayEvents();
  const [teacherViewing, setTeacherViewing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [modeChangedWhileActive, setModeChangedWhileActive] = useState(false);
  const [isOutputImmersive, setOutputImmersive] = useState(false);
  const terminalPanelRef = useRef<import('react-resizable-panels').ImperativePanelHandle | null>(null);
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const aiResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { emit, on, onConnect, status: wsStatus } = useWebSocket('/api/ws');
  const terminalRef = useRef<XTerm | null>(null);

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
      },
      (exitCode) => {
        const msg = exitCode === -1
          ? '\r\n\x1b[33m[Stopped]\x1b[0m\r\n'
          : `\r\n\x1b[${exitCode === 0 ? '32' : '31'}m[Exited with code ${exitCode}]\x1b[0m\r\n`;
        terminalRef.current?.write(msg);
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

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === activeTab) return;
    if (tab === 'output') {
      clearNewEvent();
      // If adventure content, go immersive
      if (hasAdventureContent) {
        setOutputImmersive(true);
        terminalPanelRef.current?.collapse();
      }
    } else {
      // Switching away from output — restore terminal
      setOutputImmersive(false);
      terminalPanelRef.current?.expand();
    }
    setActiveTab(tab);
    setDisplayActiveTab(tab);
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

  const handleToggleImmersive = () => {
    setOutputImmersive((prev) => {
      const next = !prev;
      if (next) {
        terminalPanelRef.current?.collapse();
      } else {
        terminalPanelRef.current?.expand();
      }
      return next;
    });
  };

  const showChatPanel = isAiChatOpen && !(activeTab === 'output' && isOutputImmersive);

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
    resetDisplay();
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

  const activeFile = files?.find(f => f.id === activeFileId);
  const isDirty = activeFileId ? unsavedChanges[activeFileId] !== undefined : false;
  const isChatMode = aiConfig?.mode === 'chat';
  const isAiEnabled = aiConfig?.mode !== 'off';
  const aiCredits = (profile as Record<string, unknown> | undefined)?.aiCredits as number | undefined;

  return (
    <div className="h-dvh w-full flex flex-col bg-background overflow-hidden font-sans">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="font-display font-bold text-lg text-primary tracking-tight">PyLearn</div>
            <span className="text-[10px] text-muted-foreground font-mono">{APP_VERSION}</span>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground">
              {[profile?.firstName ?? (user as { firstName?: string } | null)?.firstName, profile?.lastName ?? (user as { lastName?: string } | null)?.lastName].filter(Boolean).join(' ') || 'Student'}
            </span>
            {wsStatus === 'connected' ? (
              <Wifi size={14} className="text-green-500" title="Connected" />
            ) : (
              <WifiOff size={14} className="text-red-400 animate-pulse" title="Connecting…" />
            )}
          </div>
          {teacherViewing && (
            <div className="px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Teacher is viewing
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!isChatMode && (
            <>
              {activeFile && (
                <span className="text-sm text-muted-foreground mr-4">
                  {activeFile.filename} {isDirty && '*'}
                </span>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateFile.isPending}
                className="rounded-xl"
              >
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>

              {isRunning ? (
                <Button
                  onClick={stopCode}
                  size="sm"
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20"
                >
                  <Square className="w-4 h-4 mr-2" /> Stop
                </Button>
              ) : (
                <Button
                  onClick={handleRun}
                  disabled={!activeFileId}
                  size="sm"
                  className="rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20"
                >
                  <Play className="w-4 h-4 mr-2" /> Run
                </Button>
              )}

              <div className="w-px h-6 bg-border mx-2" />
            </>
          )}

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

      <div className="flex-1 overflow-hidden flex">
        {isChatMode ? (
          /* ---- Chat Mode Layout ---- */
          <>
            <div className="flex-1 overflow-hidden">
              <PanelGroup direction="horizontal">
                <Panel defaultSize={15} minSize={10} maxSize={25}>
                  <Sidebar
                    aiMode="chat"
                    onPromptSelect={(content) => setPendingPrompt(content)}
                  />
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
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
          </>
        ) : (
          /* ---- Normal Coding Layout ---- */
          <>
            <div className="flex-1 overflow-hidden">
              <PanelGroup direction="horizontal">
                <Panel defaultSize={15} minSize={10} maxSize={25}>
                  <Sidebar onFileSelect={() => handleTabChange('code')} aiMode={aiConfig?.mode} />
                </Panel>

                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                <Panel defaultSize={85}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={65}>
                      <div className="h-full flex flex-col">
                        <div className="flex items-center border-b border-border bg-muted/30 shrink-0">
                          <button
                            onClick={() => handleTabChange('code')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                              activeTab === 'code'
                                ? 'border-primary text-primary bg-background'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Code className="w-4 h-4" />
                            Source Code
                          </button>
                          <button
                            onClick={() => handleTabChange('output')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 relative ${
                              activeTab === 'output'
                                ? 'border-primary text-primary bg-background'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Monitor className="w-4 h-4" />
                            Output
                            {hasNewEvent && activeTab !== 'output' && (
                              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                            )}
                          </button>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                          <div className={`absolute inset-0 ${activeTab === 'code' ? '' : 'invisible'}`}>
                            <EditorPanel onContentChange={handleEditorChange} />
                          </div>
                          <div className={`absolute inset-0 ${activeTab === 'output' ? '' : 'invisible'}`}>
                            <OutputPanel
                              displayMessages={displayMessages}
                              adventureState={adventureState}
                              hasAdventureContent={hasAdventureContent}
                              isImmersive={isOutputImmersive}
                              onToggleImmersive={handleToggleImmersive}
                              onInput={sendInput}
                              onClear={resetDisplay}
                            />
                          </div>
                        </div>
                      </div>
                    </Panel>

                    <PanelResizeHandle className={`h-1 bg-border hover:bg-primary/50 transition-colors ${isOutputImmersive && activeTab === 'output' ? 'hidden' : ''}`} />

                    <Panel
                      ref={terminalPanelRef}
                      defaultSize={35}
                      minSize={15}
                      collapsible
                      collapsedSize={0}
                      className={`${isOutputFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}
                    >
                      <div className="h-full flex flex-col bg-card border-t border-border">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                          <span className="text-sm font-medium text-muted-foreground">
                            Terminal {isRunning && <span className="text-green-500 animate-pulse">● Running</span>}
                          </span>
                          <Button variant="ghost" size="icon" onClick={() => setFullscreen(!isOutputFullscreen)} className="w-6 h-6">
                            {isOutputFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                          </Button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-[#0f172a]">
                          <Terminal
                            terminalRef={terminalRef}
                            onInput={sendInput}
                          />
                        </div>
                        <div className="h-3 bg-card shrink-0" />
                      </div>
                    </Panel>
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            </div>
            {isAiEnabled && isAiChatOpen && showChatPanel && (
              <div className="flex shrink-0">
                <div
                  className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize shrink-0"
                  onMouseDown={handleAiPanelResizeStart}
                />
                <div style={{ width: aiPanelWidth }} className="overflow-hidden">
                  <AiPanel />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
