import React, { useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '@/lib/version';
import { useAuth } from '@workspace/auth-web';
import { useLocation } from 'wouter';
import { setSessionType } from '@/lib/session-type';

import { useListStudents, useGetAiConfig, useUpdateAiConfig, useListHelpRequests, useDismissHelpRequest, useListStudentAccounts, useCreateStudentAccount, useToggleStudentPause, useDeleteStudentAccount, useUpdateStudentCredits, useListCheatSheets, useCreateCheatSheet, useUpdateCheatSheet, useDeleteCheatSheet, useToggleCheatSheet } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { BookOpen, Settings, Users, AlertCircle, LogOut, UserPlus, Pause, Play, Trash2, Copy, Check, Plus, FileCode, ChevronDown, Library, ChevronRight, MessageCircle, RotateCcw, FileText, Eye, EyeOff, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { useWebSocket } from '@/hooks/use-websocket';
import { toast } from '@/hooks/use-toast';

interface ProgramTemplate {
  id: number;
  filename: string;
  content: string;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptTemplate {
  id: number;
  title: string;
  content: string;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
}

interface AiConfigForm {
  provider: string;
  mode: string;
  apiKey: string;
  suggestionSystemPrompt: string;
  agentSystemPrompt: string;
  offSystemPrompt: string;
  chatSystemPrompt: string;
}

function CheatSheetsTab() {
  const { t } = useTranslation();
  const { data: sheets = [], isLoading, refetch } = useListCheatSheets();
  const createSheet = useCreateCheatSheet();
  const updateSheet = useUpdateCheatSheet();
  const deleteSheet = useDeleteCheatSheet();
  const toggleSheet = useToggleCheatSheet();

  const [editing, setEditing] = useState<null | { id?: number; title: string; content: string; sortOrder: number }>(null);

  const handleSave = () => {
    if (!editing || !editing.title.trim()) return;
    const data = { title: editing.title.trim(), content: editing.content, sortOrder: editing.sortOrder };
    if (editing.id) {
      updateSheet.mutate({ id: editing.id, data }, { onSuccess: () => { refetch(); setEditing(null); } });
    } else {
      createSheet.mutate({ data }, { onSuccess: () => { refetch(); setEditing(null); } });
    }
  };

  const handleToggle = (id: number) => {
    toggleSheet.mutate({ id }, { onSuccess: refetch });
  };

  const handleDelete = (id: number) => {
    if (!confirm(t('admin.sheets_delete_confirm'))) return;
    deleteSheet.mutate({ id }, { onSuccess: refetch });
  };

  if (editing !== null) {
    return (
      <Card className="shadow-md max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {editing.id ? t('admin.sheets_edit_title') : t('admin.sheets_new_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs mb-1 block">{t('admin.sheets_title_label')}</Label>
              <Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Python Basics" />
            </div>
            <div className="w-24">
              <Label className="text-xs mb-1 block">{t('admin.sheets_order_label')}</Label>
              <Input type="number" value={editing.sortOrder} onChange={e => setEditing({ ...editing, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">{t('admin.sheets_content_label')}</Label>
            <Textarea
              value={editing.content}
              onChange={e => setEditing({ ...editing, content: e.target.value })}
              className="font-mono text-sm min-h-[400px]"
              placeholder="# Python Basics&#10;&#10;## Variables&#10;```python&#10;x = 5&#10;```"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={createSheet.isPending || updateSheet.isPending}>{t('common.save')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> {t('admin.sheets_title')}</CardTitle>
          <CardDescription>{t('admin.sheets_desc')}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing({ title: '', content: '', sortOrder: 0 })}>
          <Plus className="w-4 h-4 mr-1" /> {t('admin.sheets_new')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">{t('admin.sheets_loading')}</p> : sheets.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">{t('admin.sheets_empty')}</p>
        ) : (
          <div className="space-y-2">
            {sheets.map(sheet => (
              <div key={sheet.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{sheet.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{sheet.content.slice(0, 60) || '(empty)'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => handleToggle(sheet.id)}
                    className={sheet.isActive ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground'}
                    title={sheet.isActive ? t('admin.sheets_active') : t('admin.sheets_hidden')}
                  >
                    {sheet.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    <span className="ml-1 text-xs">{sheet.isActive ? t('admin.sheets_active') : t('admin.sheets_hidden')}</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ id: sheet.id, title: sheet.title, content: sheet.content, sortOrder: sheet.sortOrder })}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(sheet.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  setSessionType('admin');
  const { t } = useTranslation();
  const { logout, user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { data: students } = useListStudents({ query: { enabled: isAuthenticated, refetchInterval: 10000 } });
  const { data: requests } = useListHelpRequests({ query: { enabled: isAuthenticated, refetchInterval: 10000 } });
  const dismissReq = useDismissHelpRequest();
  const { data: studentAccounts, refetch: refetchAccounts } = useListStudentAccounts({ query: { enabled: isAuthenticated, refetchInterval: 10000 } });
  const createStudent = useCreateStudentAccount();
  const togglePause = useToggleStudentPause();
  const deleteStudent = useDeleteStudentAccount();
  const updateCredits = useUpdateStudentCredits();

  const { data: aiConfig, isLoading: configLoading } = useGetAiConfig({ query: { enabled: isAuthenticated } });
  const updateConfig = useUpdateAiConfig();
  const { on } = useWebSocket('/api/ws');

  const [formData, setFormData] = useState<AiConfigForm | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdPin, setCreatedPin] = useState<{ name: string; pin: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [deleteProgramConfirm, setDeleteProgramConfirm] = useState<number | null>(null);
  const [assigningProgram, setAssigningProgram] = useState<number | null>(null);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [newProgramFilename, setNewProgramFilename] = useState('');
  const [newProgramContent, setNewProgramContent] = useState('');
  const [savingProgram, setSavingProgram] = useState(false);
  const [seedingDemos, setSeedingDemos] = useState(false);
  const [libraryRef, setLibraryRef] = useState<string | null>(null);
  const [libraryRefOpen, setLibraryRefOpen] = useState(false);

  // Prompt templates state
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [deletePromptConfirm, setDeletePromptConfirm] = useState<number | null>(null);
  const [assigningPrompt, setAssigningPrompt] = useState<number | null>(null);
  const [newPromptOpen, setNewPromptOpen] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);

  const fetchPrograms = useCallback(async () => {
    if (!isAuthenticated) return;
    setProgramsLoading(true);
    try {
      const res = await fetch('/api/admin/programs', { credentials: 'include' });
      if (res.ok) setPrograms(await res.json());
    } finally {
      setProgramsLoading(false);
    }
  }, [isAuthenticated]);

  const fetchPrompts = useCallback(async () => {
    if (!isAuthenticated) return;
    setPromptsLoading(true);
    try {
      const res = await fetch('/api/admin/prompts', { credentials: 'include' });
      if (res.ok) setPrompts(await res.json());
    } finally {
      setPromptsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);
  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/admin/ai-library-ref', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLibraryRef(d.content))
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (aiConfig && !formData) {
      setFormData({
        provider: aiConfig.provider,
        mode: aiConfig.mode,
        apiKey: '',
        suggestionSystemPrompt: aiConfig.suggestionSystemPrompt,
        agentSystemPrompt: aiConfig.agentSystemPrompt,
        offSystemPrompt: aiConfig.offSystemPrompt,
        chatSystemPrompt: aiConfig.chatSystemPrompt,
      });
    }
  }, [aiConfig, formData]);

  useEffect(() => {
    const off1 = on('user-online', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/class-roster'] });
    });
    const off2 = on('user-offline', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/class-roster'] });
    });
    const off3 = on('help-requested', (msg: Record<string, unknown>) => {
      queryClient.invalidateQueries({ queryKey: ['/api/help-requests'] });
      toast({ title: "Help Request", description: `A student needs help: ${String(msg.message || '')}` });
    });
    const off4 = on('help-dismissed', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/help-requests'] });
    });
    return () => { off1(); off2(); off3(); off4(); };
  }, [on, queryClient]);

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background text-muted-foreground">{t('common.loading')}</div>;
  }
  if (!isAuthenticated) return null;

  const handleSaveProgram = async () => {
    let filename = newProgramFilename.trim();
    if (!filename) return;
    if (!filename.endsWith('.py')) filename += '.py';
    setSavingProgram(true);
    try {
      const res = await fetch('/api/admin/programs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: newProgramContent }),
      });
      if (res.ok) {
        await fetchPrograms();
        toast({ title: 'Saved', description: `${filename} added to Programs Library` });
        setNewProgramOpen(false);
        setNewProgramFilename('');
        setNewProgramContent('');
      } else {
        const err = await res.json();
        toast({ title: 'Save failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setSavingProgram(false);
    }
  };

  const handleSeedDemos = async () => {
    setSeedingDemos(true);
    try {
      const res = await fetch('/api/admin/programs/seed-demos', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        await fetchPrograms();
        if (data.created.length > 0) {
          toast({ title: 'Demos loaded', description: `Added ${data.created.length} demo program${data.created.length === 1 ? '' : 's'}` });
        } else {
          toast({ title: 'Already loaded', description: 'All demo programs are already in your library' });
        }
      } else {
        toast({ title: 'Error', description: 'Failed to load demo programs', variant: 'destructive' });
      }
    } finally {
      setSeedingDemos(false);
    }
  };

  const handleDeleteProgram = async (id: number) => {
    const res = await fetch(`/api/admin/programs/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeleteProgramConfirm(null);
      setPrograms(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Deleted', description: 'Program removed from library' });
    }
  };

  const handleAssignProgram = async (programId: number, studentId: string, studentName: string) => {
    const res = await fetch(`/api/admin/programs/${programId}/assign`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    if (res.ok) {
      setAssigningProgram(null);
      toast({ title: 'Assigned!', description: `Program sent to ${studentName}` });
    } else {
      toast({ title: 'Error', description: 'Could not assign program', variant: 'destructive' });
    }
  };

  const handleSaveConfig = () => {
    if (!formData) return;
    const payload: Record<string, string> = {
      provider: formData.provider,
      mode: formData.mode,
      suggestionSystemPrompt: formData.suggestionSystemPrompt,
      agentSystemPrompt: formData.agentSystemPrompt,
      offSystemPrompt: formData.offSystemPrompt,
      chatSystemPrompt: formData.chatSystemPrompt,
    };
    if (formData.apiKey) {
      payload.apiKey = formData.apiKey;
    }
    updateConfig.mutate({ data: payload }, {
      onSuccess: () => toast({ title: "Saved", description: "AI configuration updated." })
    });
  };

  const handleCreateStudent = () => {
    if (!newStudentName.trim()) return;
    createStudent.mutate({ data: { displayName: newStudentName.trim() } }, {
      onSuccess: (data) => {
        setCreatedPin({ name: data.displayName, pin: data.pin });
        setNewStudentName('');
        setShowCreateForm(false);
        refetchAccounts();
        toast({ title: "Student Created", description: `Account created for ${data.displayName}` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to create student account" });
      }
    });
  };

  const handleTogglePause = (id: string, isPaused: boolean) => {
    togglePause.mutate({ id, data: { isPaused } }, {
      onSuccess: () => {
        refetchAccounts();
        toast({ title: isPaused ? "Paused" : "Resumed", description: isPaused ? "Student access paused" : "Student access resumed" });
      }
    });
  };

  const handleDeleteStudent = (id: string) => {
    deleteStudent.mutate({ id }, {
      onSuccess: () => {
        setDeleteConfirm(null);
        refetchAccounts();
        toast({ title: "Deleted", description: "Student account permanently deleted" });
      }
    });
  };

  const handleResetCredits = (id: string, displayName: string) => {
    updateCredits.mutate({ id, data: { aiCredits: 10 } }, {
      onSuccess: () => {
        refetchAccounts();
        toast({ title: 'Credits Reset', description: `${displayName} now has 10 AI credits` });
      }
    });
  };

  const handleSavePrompt = async () => {
    const title = newPromptTitle.trim();
    if (!title) return;
    setSavingPrompt(true);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: newPromptContent }),
      });
      if (res.ok) {
        await fetchPrompts();
        toast({ title: 'Saved', description: `"${title}" added to Prompts Library` });
        setNewPromptOpen(false);
        setNewPromptTitle('');
        setNewPromptContent('');
      } else {
        const err = await res.json();
        toast({ title: 'Save failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async (id: number) => {
    const res = await fetch(`/api/admin/prompts/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeletePromptConfirm(null);
      setPrompts(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Deleted', description: 'Prompt removed from library' });
    }
  };

  const handleAssignPrompt = async (promptId: number, studentId: string, studentName: string) => {
    const res = await fetch(`/api/admin/prompts/${promptId}/assign`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    if (res.ok) {
      setAssigningPrompt(null);
      toast({ title: 'Assigned!', description: `Prompt sent to ${studentName}` });
    } else {
      toast({ title: 'Error', description: 'Could not assign prompt', variant: 'destructive' });
    }
  };

  const copyPin = (pin: string, id: string) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(id);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans">
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-display font-bold">{t('admin.title')}</h1>
            <span className="text-[10px] text-muted-foreground font-mono self-center">{APP_VERSION}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{user?.firstName} ({t('admin.teacher_label')})</span>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-2"/> {t('common.logout')}</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-7 mb-8">
            <TabsTrigger value="overview">{t('admin.tab_overview')}</TabsTrigger>
            <TabsTrigger value="students">{t('admin.tab_students')}</TabsTrigger>
            <TabsTrigger value="programs">{t('admin.tab_programs')}</TabsTrigger>
            <TabsTrigger value="prompts">{t('admin.tab_prompts')}</TabsTrigger>
            <TabsTrigger value="cheatsheets">{t('admin.tab_cheatsheets')}</TabsTrigger>
            <TabsTrigger value="settings">{t('admin.tab_settings')}</TabsTrigger>
            <TabsTrigger value="my-workspace">{t('admin.tab_my_workspace')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="border-accent/20 shadow-md">
                <CardHeader className="bg-accent/5 border-b border-accent/10 pb-4">
                  <CardTitle className="flex items-center gap-2 text-accent-foreground">
                    <AlertCircle className="w-5 h-5 text-accent" /> {t('admin.help_title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(!requests || requests.length === 0) ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">{t('admin.help_empty')}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {requests.filter(r => r.status === 'active').map(req => (
                        <div key={req.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                          <div>
                            <p className="font-semibold">{req.userName}</p>
                            <p className="text-sm text-muted-foreground">{req.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(req.createdAt))} ago</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setLocation(`/admin/student/${req.userId}`)}>{t('admin.help_join')}</Button>
                            <Button size="sm" variant="outline" onClick={() => dismissReq.mutate({ id: req.id })}>{t('admin.help_dismiss')}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/> {t('admin.roster_title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4">
                    {students?.map(student => (
                      <div key={student.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar>
                              <AvatarImage src={student.profileImageUrl || ''} />
                              <AvatarFallback>{student.firstName?.[0]}</AvatarFallback>
                            </Avatar>
                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${student.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{student.firstName} {student.lastName}</p>
                            {student.hasHelpRequest && <Badge variant="destructive" className="mt-1 text-[10px]">{t('admin.roster_needs_help')}</Badge>}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => setLocation(`/admin/student/${student.id}`)}>
                          {t('admin.roster_view')}
                        </Button>
                      </div>
                    ))}
                    {(!students || students.length === 0) && (
                      <div className="p-8 text-center text-muted-foreground text-sm">{t('admin.roster_empty')}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="students">
            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5"/> {t('admin.students_title')}</CardTitle>
                  <CardDescription>{t('admin.students_desc')}</CardDescription>
                </div>
                <Button onClick={() => { setShowCreateForm(true); setCreatedPin(null); }}>
                  <UserPlus className="w-4 h-4 mr-2" /> {t('admin.students_create_btn')}
                </Button>
              </CardHeader>
              <CardContent>
                {showCreateForm && (
                  <div className="mb-6 p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
                    <h3 className="font-semibold mb-3">{t('admin.students_new_section')}</h3>
                    <div className="flex gap-3">
                      <Input
                        placeholder={t('admin.students_name_placeholder')}
                        value={newStudentName}
                        onChange={e => setNewStudentName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateStudent()}
                        className="max-w-xs"
                      />
                      <Button onClick={handleCreateStudent} disabled={createStudent.isPending || !newStudentName.trim()}>
                        {createStudent.isPending ? t('admin.students_creating') : t('common.create')}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowCreateForm(false)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                )}

                {createdPin && (
                  <div className="mb-6 p-4 rounded-xl border-2 border-green-500/30 bg-green-50 dark:bg-green-950/20">
                    <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">{t('admin.students_account_created')}</h3>
                    <p className="text-sm mb-2">{t('admin.students_pin_hint', { name: createdPin.name })}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-mono font-bold tracking-[0.3em] bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border">{createdPin.pin}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyPin(createdPin.pin, 'new')}
                      >
                        {copiedPin === 'new' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t('admin.students_pin_note')}</p>
                  </div>
                )}

                <div className="space-y-3">
                  {studentAccounts?.map(account => (
                    <div key={account.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className={account.isPaused ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}>
                              {account.displayName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{account.displayName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{t('admin.students_pin_label')}</span>
                              <span className="text-sm font-mono font-bold tracking-wider">{account.pin}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => copyPin(account.pin, account.id)}
                              >
                                {copiedPin === account.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{t('admin.students_created_ago', { time: formatDistanceToNow(new Date(account.createdAt)) })}</p>
                          </div>
                        </div>
                        <Badge
                          variant={account.isPaused ? "outline" : "default"}
                          className={account.isPaused
                            ? "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-700"
                            : "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700"
                          }
                        >
                          {account.isPaused ? t('admin.students_paused') : t('admin.students_active')}
                        </Badge>
                        <div className="flex items-center gap-1.5 ml-2">
                          <Badge variant="outline" className={account.aiCredits === 0 ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-700' : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-700'}>
                            {account.aiCredits} {t('admin.credits_label')}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            title={t('admin.credits_reset_title')}
                            onClick={() => handleResetCredits(account.id, account.displayName)}
                            disabled={updateCredits.isPending}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.isPaused ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => handleTogglePause(account.id, false)}
                            disabled={togglePause.isPending}
                          >
                            <Play className="w-4 h-4 mr-1" /> {t('admin.students_resume')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 border-orange-300 hover:bg-orange-50"
                            onClick={() => handleTogglePause(account.id, true)}
                            disabled={togglePause.isPending}
                          >
                            <Pause className="w-4 h-4 mr-1" /> {t('admin.students_pause')}
                          </Button>
                        )}
                        {deleteConfirm === account.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-destructive font-medium">{t('admin.students_delete_confirm')}</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteStudent(account.id)}
                              disabled={deleteStudent.isPending}
                            >
                              {t('common.confirm')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setDeleteConfirm(account.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!studentAccounts || studentAccounts.length === 0) && !showCreateForm && (
                    <div className="p-12 text-center text-muted-foreground">
                      <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">{t('admin.students_empty')}</p>
                      <p className="text-sm mb-4">{t('admin.students_empty_desc')}</p>
                      <Button onClick={() => setShowCreateForm(true)}>
                        <UserPlus className="w-4 h-4 mr-2" /> {t('admin.students_create_first')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="programs">
            <Dialog open={newProgramOpen} onOpenChange={(open) => {
              setNewProgramOpen(open);
              if (!open) { setNewProgramFilename(''); setNewProgramContent(''); }
            }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('admin.programs_dialog_title')}</DialogTitle>
                  <DialogDescription>{t('admin.programs_dialog_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prog-filename">{t('admin.programs_filename_label')}</Label>
                    <Input
                      id="prog-filename"
                      placeholder={t('admin.programs_filename_placeholder')}
                      value={newProgramFilename}
                      onChange={e => setNewProgramFilename(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !savingProgram && handleSaveProgram()}
                    />
                    <p className="text-xs text-muted-foreground">{t('admin.programs_filename_hint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prog-content">{t('admin.programs_code_label')}</Label>
                    <Textarea
                      id="prog-content"
                      placeholder="# write your Python code here"
                      className="min-h-[240px] font-mono text-sm"
                      value={newProgramContent}
                      onChange={e => setNewProgramContent(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewProgramOpen(false)} disabled={savingProgram}>{t('common.cancel')}</Button>
                  <Button onClick={handleSaveProgram} disabled={savingProgram || !newProgramFilename.trim()}>
                    {savingProgram ? t('admin.programs_saving') : t('admin.programs_save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileCode className="w-5 h-5"/> {t('admin.programs_title')}</CardTitle>
                  <CardDescription>{t('admin.programs_desc')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleSeedDemos} disabled={seedingDemos}>
                    <BookOpen className="w-4 h-4 mr-2" /> {seedingDemos ? t('admin.programs_loading') : t('admin.programs_load_demos')}
                  </Button>
                  <Button onClick={() => setNewProgramOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> {t('admin.programs_new')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {programsLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
                ) : programs.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <FileCode className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">{t('admin.programs_empty')}</p>
                    <p className="text-sm">{t('admin.programs_empty_desc')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {programs.map(program => (
                      <div key={program.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileCode className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{program.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('admin.programs_uploaded_ago', { time: formatDistanceToNow(new Date(program.createdAt)) })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-primary border-primary/30 hover:bg-primary/10"
                              onClick={() => setAssigningProgram(assigningProgram === program.id ? null : program.id)}
                            >
                              {t('admin.programs_assign')} <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                            {assigningProgram === program.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[180px] overflow-hidden">
                                {studentAccounts && studentAccounts.length > 0 ? (
                                  studentAccounts.map(account => (
                                    <button
                                      key={account.id}
                                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
                                      onClick={() => handleAssignProgram(program.id, account.id, account.displayName)}
                                    >
                                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                                        {account.displayName[0]?.toUpperCase()}
                                      </span>
                                      {account.displayName}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-xs text-muted-foreground">{t('admin.programs_no_students')}</div>
                                )}
                              </div>
                            )}
                          </div>

                          {deleteProgramConfirm === program.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-destructive font-medium">{t('admin.delete_confirm_label')}</span>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteProgram(program.id)}>{t('common.yes')}</Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteProgramConfirm(null)}>{t('common.no')}</Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setDeleteProgramConfirm(program.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prompts">
            <Dialog open={newPromptOpen} onOpenChange={(open) => {
              setNewPromptOpen(open);
              if (!open) { setNewPromptTitle(''); setNewPromptContent(''); }
            }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('admin.prompts_dialog_title')}</DialogTitle>
                  <DialogDescription>{t('admin.prompts_dialog_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prompt-title">{t('admin.prompts_title_label')}</Label>
                    <Input
                      id="prompt-title"
                      placeholder={t('admin.prompts_title_placeholder')}
                      value={newPromptTitle}
                      onChange={e => setNewPromptTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !savingPrompt && handleSavePrompt()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prompt-content">{t('admin.prompts_content_label')}</Label>
                    <Textarea
                      id="prompt-content"
                      placeholder={t('admin.prompts_content_placeholder')}
                      className="min-h-[240px] text-sm"
                      value={newPromptContent}
                      onChange={e => setNewPromptContent(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewPromptOpen(false)} disabled={savingPrompt}>{t('common.cancel')}</Button>
                  <Button onClick={handleSavePrompt} disabled={savingPrompt || !newPromptTitle.trim()}>
                    {savingPrompt ? t('admin.prompts_saving') : t('admin.prompts_save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5"/> {t('admin.prompts_title')}</CardTitle>
                  <CardDescription>{t('admin.prompts_desc')}</CardDescription>
                </div>
                <Button onClick={() => setNewPromptOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> {t('admin.prompts_new')}
                </Button>
              </CardHeader>
              <CardContent>
                {promptsLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
                ) : prompts.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">{t('admin.prompts_empty')}</p>
                    <p className="text-sm">{t('admin.prompts_empty_desc')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prompts.map(prompt => (
                      <div key={prompt.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                            <MessageCircle className="w-5 h-5 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{prompt.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{prompt.content || '(empty)'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-primary border-primary/30 hover:bg-primary/10"
                              onClick={() => setAssigningPrompt(assigningPrompt === prompt.id ? null : prompt.id)}
                            >
                              {t('admin.programs_assign')} <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                            {assigningPrompt === prompt.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[180px] overflow-hidden">
                                {studentAccounts && studentAccounts.length > 0 ? (
                                  studentAccounts.map(account => (
                                    <button
                                      key={account.id}
                                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
                                      onClick={() => handleAssignPrompt(prompt.id, account.id, account.displayName)}
                                    >
                                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                                        {account.displayName[0]?.toUpperCase()}
                                      </span>
                                      {account.displayName}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-xs text-muted-foreground">{t('admin.programs_no_students')}</div>
                                )}
                              </div>
                            )}
                          </div>

                          {deletePromptConfirm === prompt.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-destructive font-medium">{t('admin.delete_confirm_label')}</span>
                              <Button size="sm" variant="destructive" onClick={() => handleDeletePrompt(prompt.id)}>{t('common.yes')}</Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeletePromptConfirm(null)}>{t('common.no')}</Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setDeletePromptConfirm(prompt.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cheatsheets">
            <CheatSheetsTab />
          </TabsContent>

          <TabsContent value="my-workspace">
            <Card className="shadow-md max-w-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="w-5 h-5" /> {t('admin.demo_title')}
                </CardTitle>
                <CardDescription>{t('admin.demo_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setLocation('/admin/demo-workspace')}>
                  <FileCode className="w-4 h-4 mr-2" /> {t('admin.demo_launch_btn')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="shadow-md max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5"/> {t('admin.ai_title')}</CardTitle>
                <CardDescription>{t('admin.ai_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {configLoading || !formData ? <div className="p-4 text-center">{t('common.loading')}</div> : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>{t('admin.ai_mode_label')}</Label>
                      <Select value={formData.mode} onValueChange={v => setFormData({...formData, mode: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">{t('admin.ai_mode_off')}</SelectItem>
                          <SelectItem value="suggestion">{t('admin.ai_mode_suggestion')}</SelectItem>
                          <SelectItem value="agent">{t('admin.ai_mode_agent')}</SelectItem>
                          <SelectItem value="chat">{t('admin.ai_mode_chat')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('admin.ai_provider_label')}</Label>
                      <Select value={formData.provider} onValueChange={v => setFormData({...formData, provider: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                          <SelectItem value="gemini">Google Gemini</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.provider !== 'openai' && (
                      <div className="space-y-2">
                        <Label>{t('admin.ai_apikey_label', { provider: formData.provider })}</Label>
                        <input
                          type="password"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder={t('admin.ai_apikey_placeholder')}
                          value={formData.apiKey}
                          onChange={e => setFormData({...formData, apiKey: e.target.value})}
                        />
                        <p className="text-xs text-muted-foreground">{t('admin.ai_apikey_hint')}</p>
                      </div>
                    )}

                    <Tabs defaultValue="suggestion" className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="suggestion">{t('admin.ai_tab_suggest')}</TabsTrigger>
                        <TabsTrigger value="agent">{t('admin.ai_tab_agent')}</TabsTrigger>
                        <TabsTrigger value="chat">{t('admin.ai_tab_chat')}</TabsTrigger>
                        <TabsTrigger value="off">{t('admin.ai_tab_off')}</TabsTrigger>
                      </TabsList>
                      <div className="mt-4">
                        <TabsContent value="suggestion" className="space-y-2 m-0">
                          <Label className="text-xs">{t('admin.ai_prompt_suggest')}</Label>
                          <Textarea
                            className="min-h-[200px] text-xs font-mono"
                            value={formData.suggestionSystemPrompt}
                            onChange={e => setFormData({...formData, suggestionSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                        <TabsContent value="agent" className="space-y-2 m-0">
                          <Label className="text-xs">{t('admin.ai_prompt_agent')}</Label>
                          <Textarea
                            className="min-h-[200px] text-xs font-mono"
                            value={formData.agentSystemPrompt}
                            onChange={e => setFormData({...formData, agentSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                        <TabsContent value="chat" className="space-y-2 m-0">
                          <Label className="text-xs">{t('admin.ai_prompt_chat')}</Label>
                          <Textarea
                            className="min-h-[200px] text-xs font-mono"
                            value={formData.chatSystemPrompt}
                            onChange={e => setFormData({...formData, chatSystemPrompt: e.target.value})}
                          />
                          <p className="text-xs text-muted-foreground">{t('admin.ai_prompt_chat_hint')}</p>
                        </TabsContent>
                        <TabsContent value="off" className="space-y-2 m-0">
                          <Label className="text-xs">{t('admin.ai_prompt_off')}</Label>
                          <Textarea
                            className="min-h-[100px] text-xs font-mono"
                            value={formData.offSystemPrompt}
                            onChange={e => setFormData({...formData, offSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                      </div>
                    </Tabs>

                    <Button className="w-full" onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                      {updateConfig.isPending ? t('admin.ai_saving') : t('admin.ai_save')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {libraryRef && (
              <Card className="shadow-md max-w-2xl mt-4">
                <CardHeader
                  className="cursor-pointer select-none flex flex-row items-center justify-between py-4"
                  onClick={() => setLibraryRefOpen(o => !o)}
                >
                  <div className="flex items-center gap-2">
                    <Library className="w-5 h-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{t('admin.lib_title')}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {t('admin.lib_desc')}
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${libraryRefOpen ? 'rotate-90' : ''}`} />
                </CardHeader>
                {libraryRefOpen && (
                  <CardContent className="pt-0">
                    <pre className="text-xs font-mono bg-muted/50 rounded-lg p-4 overflow-auto max-h-[600px] whitespace-pre-wrap leading-relaxed border border-border">
                      {libraryRef}
                    </pre>
                  </CardContent>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
