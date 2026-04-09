import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { setSessionType } from '@/lib/session-type';

// Set session type before any hooks fire
setSessionType('admin');
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useListFiles, useListStudents } from '@workspace/api-client-react';
import { EditorPanel } from '@/components/workspace/EditorPanel';
import { AiPanel } from '@/components/workspace/AiPanel';
import { Terminal } from '@/components/workspace/Terminal';
import { OutputPanel } from '@/components/workspace/OutputPanel';
import { useWorkspaceStore } from '@/store/workspace';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, FileCode, MessageSquare, Code, Monitor } from 'lucide-react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useDisplayEvents } from '@/hooks/use-display-events';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { Terminal as XTerm } from '@xterm/xterm';

type ActiveTab = 'code' | 'output';

export default function AdminWorkspaceView() {
  const [, params] = useRoute('/admin/student/:id');
  const studentId = params?.id;
  const [, setLocation] = useLocation();
  
  const { data: students } = useListStudents();
  const student = students?.find(s => s.id.toString() === studentId);
  
  const { data: files } = useListFiles({ userId: studentId }, { query: { enabled: !!studentId, refetchInterval: 2000 } });
  
  const { 
    setOpenFiles, activeFileId, setActiveFile, unsavedChanges, updateUnsavedContent,
    isAiChatOpen, toggleAiChat
  } = useWorkspaceStore();
  const [coEdit, setCoEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const { emit, on } = useWebSocket('/api/ws');
  const {
    displayMessages, adventureState, hasNewEvent, hasAdventureContent,
    clearNewEvent, resetState: resetDisplay, setActiveTab: setDisplayActiveTab,
  } = useDisplayEvents(studentId);
  const terminalRef = useRef<XTerm | null>(null);

  const showChatPanel = isAiChatOpen && activeTab !== 'output';

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
      emit('co-edit-delta', { room: studentId, content, filename, fileId: activeFileId });
    }
  };

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === activeTab) return;
    if (tab === 'output') {
      clearNewEvent();
    }
    setActiveTab(tab);
    setDisplayActiveTab(tab);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden font-sans">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="font-display font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Viewing: {student?.firstName} {student?.lastName}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-muted/50 px-4 py-1.5 rounded-full border border-border flex items-center gap-3">
            <Label htmlFor="coedit-mode" className="font-semibold text-sm cursor-pointer">Co-Edit</Label>
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

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={18} className="bg-sidebar border-r border-border flex flex-col">
              <div className="p-3 border-b border-border bg-sidebar-accent/50 font-semibold text-sm">
                Files
              </div>
              <div className="p-2 space-y-1">
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
            </Panel>
            
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            
            <Panel defaultSize={82}>
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
                        <div className="h-full relative">
                          {!coEdit && (
                            <div className="absolute top-4 right-6 z-50 px-3 py-1 bg-yellow-500/90 text-white rounded-full text-xs font-bold shadow-lg pointer-events-none">
                              READ ONLY
                            </div>
                          )}
                          <EditorPanel readOnly={!coEdit} onContentChange={coEdit ? handleEditorChange : undefined} />
                        </div>
                      </div>
                      <div className={`absolute inset-0 ${activeTab === 'output' ? '' : 'invisible'}`}>
                        <OutputPanel
                          displayMessages={displayMessages}
                          adventureState={adventureState}
                          hasAdventureContent={hasAdventureContent}
                          overrideUserId={studentId}
                        />
                      </div>
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />

                <Panel defaultSize={35} minSize={10}>
                  <div className="h-full flex flex-col bg-card border-t border-border">
                    <div className="px-4 py-2 border-b border-border bg-muted/30 text-sm font-medium text-muted-foreground">
                      Student Terminal (read-only)
                    </div>
                    <div className="flex-1 overflow-hidden bg-[#0f172a]">
                      <Terminal terminalRef={terminalRef} readOnly />
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>
        {isAiChatOpen && (
          <div className={`border-l border-border ${showChatPanel ? 'w-[25%] min-w-[250px] max-w-[400px]' : 'w-0 overflow-hidden'}`}>
            <AiPanel />
          </div>
        )}
      </div>
    </div>
  );
}
