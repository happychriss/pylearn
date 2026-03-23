import React, { useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '@/lib/version';
import { useAuth } from '@workspace/auth-web';
import { useLocation } from 'wouter';
import { useListStudents, useGetAiConfig, useUpdateAiConfig, useListHelpRequests, useDismissHelpRequest, useListStudentAccounts, useCreateStudentAccount, useToggleStudentPause, useDeleteStudentAccount } from '@workspace/api-client-react';
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
import { BookOpen, Settings, Users, AlertCircle, LogOut, UserPlus, Pause, Play, Trash2, Copy, Check, Plus, FileCode, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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

interface AiConfigForm {
  provider: string;
  mode: string;
  apiKey: string;
  suggestionSystemPrompt: string;
  agentSystemPrompt: string;
  offSystemPrompt: string;
}

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: students } = useListStudents({ query: { refetchInterval: 10000 } });
  const { data: requests } = useListHelpRequests({ query: { refetchInterval: 10000 } });
  const dismissReq = useDismissHelpRequest();
  const { data: studentAccounts, refetch: refetchAccounts } = useListStudentAccounts({ query: { refetchInterval: 10000 } });
  const createStudent = useCreateStudentAccount();
  const togglePause = useToggleStudentPause();
  const deleteStudent = useDeleteStudentAccount();
  
  const { data: aiConfig, isLoading: configLoading } = useGetAiConfig();
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

  const fetchPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const res = await fetch('/api/admin/programs', { credentials: 'include' });
      if (res.ok) setPrograms(await res.json());
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

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

  useEffect(() => {
    if (aiConfig && !formData) {
      setFormData({
        provider: aiConfig.provider,
        mode: aiConfig.mode,
        apiKey: '',
        suggestionSystemPrompt: aiConfig.suggestionSystemPrompt,
        agentSystemPrompt: aiConfig.agentSystemPrompt,
        offSystemPrompt: aiConfig.offSystemPrompt,
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

  const handleSaveConfig = () => {
    if (!formData) return;
    const payload: Record<string, string> = {
      provider: formData.provider,
      mode: formData.mode,
      suggestionSystemPrompt: formData.suggestionSystemPrompt,
      agentSystemPrompt: formData.agentSystemPrompt,
      offSystemPrompt: formData.offSystemPrompt,
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
            <h1 className="text-xl font-display font-bold">PyLearn Admin</h1>
            <span className="text-[10px] text-muted-foreground font-mono self-center">{APP_VERSION}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{user?.firstName} (Teacher)</span>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-2"/> Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="programs">Programs</TabsTrigger>
            <TabsTrigger value="settings">AI Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="border-accent/20 shadow-md">
                <CardHeader className="bg-accent/5 border-b border-accent/10 pb-4">
                  <CardTitle className="flex items-center gap-2 text-accent-foreground">
                    <AlertCircle className="w-5 h-5 text-accent" /> Active Help Requests
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(!requests || requests.length === 0) ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No active requests. Good job!</div>
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
                            <Button size="sm" onClick={() => setLocation(`/admin/student/${req.userId}`)}>Join Workspace</Button>
                            <Button size="sm" variant="outline" onClick={() => dismissReq.mutate({ id: req.id })}>Dismiss</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/> Class Roster</CardTitle>
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
                            {student.hasHelpRequest && <Badge variant="destructive" className="mt-1 text-[10px]">Needs Help</Badge>}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => setLocation(`/admin/student/${student.id}`)}>
                          View
                        </Button>
                      </div>
                    ))}
                    {(!students || students.length === 0) && (
                      <div className="p-8 text-center text-muted-foreground text-sm">No students yet.</div>
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
                  <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5"/> Student Accounts</CardTitle>
                  <CardDescription>Create and manage student PIN-based accounts</CardDescription>
                </div>
                <Button onClick={() => { setShowCreateForm(true); setCreatedPin(null); }}>
                  <UserPlus className="w-4 h-4 mr-2" /> Create Student
                </Button>
              </CardHeader>
              <CardContent>
                {showCreateForm && (
                  <div className="mb-6 p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
                    <h3 className="font-semibold mb-3">New Student</h3>
                    <div className="flex gap-3">
                      <Input
                        placeholder="Student name"
                        value={newStudentName}
                        onChange={e => setNewStudentName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateStudent()}
                        className="max-w-xs"
                      />
                      <Button onClick={handleCreateStudent} disabled={createStudent.isPending || !newStudentName.trim()}>
                        {createStudent.isPending ? 'Creating...' : 'Create'}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {createdPin && (
                  <div className="mb-6 p-4 rounded-xl border-2 border-green-500/30 bg-green-50 dark:bg-green-950/20">
                    <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">Account Created!</h3>
                    <p className="text-sm mb-2">Give this PIN to <strong>{createdPin.name}</strong>:</p>
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
                    <p className="text-xs text-muted-foreground mt-2">The PIN is also always visible on the student's card below.</p>
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
                              <span className="text-xs text-muted-foreground">PIN:</span>
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
                            <p className="text-xs text-muted-foreground">Created {formatDistanceToNow(new Date(account.createdAt))} ago</p>
                          </div>
                        </div>
                        <Badge
                          variant={account.isPaused ? "outline" : "default"}
                          className={account.isPaused 
                            ? "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-700" 
                            : "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700"
                          }
                        >
                          {account.isPaused ? 'Paused' : 'Active'}
                        </Badge>
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
                            <Play className="w-4 h-4 mr-1" /> Resume
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 border-orange-300 hover:bg-orange-50"
                            onClick={() => handleTogglePause(account.id, true)}
                            disabled={togglePause.isPending}
                          >
                            <Pause className="w-4 h-4 mr-1" /> Pause
                          </Button>
                        )}
                        {deleteConfirm === account.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-destructive font-medium">Permanently delete this student and all their work?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteStudent(account.id)}
                              disabled={deleteStudent.isPending}
                            >
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
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
                      <p className="text-lg font-medium mb-2">No student accounts yet</p>
                      <p className="text-sm mb-4">Create accounts for your students so they can log in with a name and PIN.</p>
                      <Button onClick={() => setShowCreateForm(true)}>
                        <UserPlus className="w-4 h-4 mr-2" /> Create First Student
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
                  <DialogTitle>New Program</DialogTitle>
                  <DialogDescription>Give it a filename and write or paste your Python code.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prog-filename">Filename</Label>
                    <Input
                      id="prog-filename"
                      placeholder="e.g. hello_world"
                      value={newProgramFilename}
                      onChange={e => setNewProgramFilename(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !savingProgram && handleSaveProgram()}
                    />
                    <p className="text-xs text-muted-foreground">.py will be added automatically if omitted</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prog-content">Code</Label>
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
                  <Button variant="outline" onClick={() => setNewProgramOpen(false)} disabled={savingProgram}>Cancel</Button>
                  <Button onClick={handleSaveProgram} disabled={savingProgram || !newProgramFilename.trim()}>
                    {savingProgram ? 'Saving...' : 'Save Program'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileCode className="w-5 h-5"/> Programs Library</CardTitle>
                  <CardDescription>Create programs and assign them to students</CardDescription>
                </div>
                <Button onClick={() => setNewProgramOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> New Program
                </Button>
              </CardHeader>
              <CardContent>
                {programsLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
                ) : programs.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <FileCode className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No programs yet</p>
                    <p className="text-sm">Create programs using the button above to build your library. Then assign them to students.</p>
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
                              Uploaded {formatDistanceToNow(new Date(program.createdAt))} ago
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
                              Assign <ChevronDown className="w-3 h-3 ml-1" />
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
                                  <div className="px-4 py-3 text-xs text-muted-foreground">No students yet</div>
                                )}
                              </div>
                            )}
                          </div>

                          {deleteProgramConfirm === program.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-destructive font-medium">Delete?</span>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteProgram(program.id)}>Yes</Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteProgramConfirm(null)}>No</Button>
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

          <TabsContent value="settings">
            <Card className="shadow-md max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5"/> AI Configuration</CardTitle>
                <CardDescription>Control the assistant's behavior</CardDescription>
              </CardHeader>
              <CardContent>
                {configLoading || !formData ? <div className="p-4 text-center">Loading...</div> : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Global AI Mode</Label>
                      <Select value={formData.mode} onValueChange={v => setFormData({...formData, mode: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">OFF (Disabled)</SelectItem>
                          <SelectItem value="suggestion">SUGGESTION (Code Diffs)</SelectItem>
                          <SelectItem value="agent">AGENT (Conversational)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Provider</Label>
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
                        <Label>API Key (for {formData.provider})</Label>
                        <input
                          type="password"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="Enter API key..."
                          value={formData.apiKey}
                          onChange={e => setFormData({...formData, apiKey: e.target.value})}
                        />
                        <p className="text-xs text-muted-foreground">Enter key directly or use ENV:VAR_NAME to reference an environment variable. Leave blank to keep existing.</p>
                      </div>
                    )}

                    <Tabs defaultValue="suggestion" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="suggestion">Suggest</TabsTrigger>
                        <TabsTrigger value="agent">Agent</TabsTrigger>
                        <TabsTrigger value="off">Off</TabsTrigger>
                      </TabsList>
                      <div className="mt-4">
                        <TabsContent value="suggestion" className="space-y-2 m-0">
                          <Label className="text-xs">System Prompt (Suggestion Mode)</Label>
                          <Textarea 
                            className="min-h-[200px] text-xs font-mono" 
                            value={formData.suggestionSystemPrompt}
                            onChange={e => setFormData({...formData, suggestionSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                        <TabsContent value="agent" className="space-y-2 m-0">
                          <Label className="text-xs">System Prompt (Agent Mode)</Label>
                          <Textarea 
                            className="min-h-[200px] text-xs font-mono" 
                            value={formData.agentSystemPrompt}
                            onChange={e => setFormData({...formData, agentSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                        <TabsContent value="off" className="space-y-2 m-0">
                          <Label className="text-xs">System Prompt (Off Mode Message)</Label>
                          <Textarea 
                            className="min-h-[100px] text-xs font-mono" 
                            value={formData.offSystemPrompt}
                            onChange={e => setFormData({...formData, offSystemPrompt: e.target.value})}
                          />
                        </TabsContent>
                      </div>
                    </Tabs>

                    <Button className="w-full" onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                      {updateConfig.isPending ? "Saving..." : "Save Configuration"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
