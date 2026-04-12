import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@workspace/auth-web';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Sparkles, Code2, Users, GraduationCap, ShieldCheck } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import { useGetMyProfile } from '@workspace/api-client-react';
import { setSessionType } from '@/lib/session-type';

const PIN_LENGTH = 6;

function PinInput({ value, onChange, onComplete, disabled }: {
  value: string;
  onChange: (val: string) => void;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(PIN_LENGTH, '').split('').slice(0, PIN_LENGTH);

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < PIN_LENGTH) {
      inputRefs.current[index]?.focus();
    }
  }, []);

  const handleChange = useCallback((index: number, char: string) => {
    if (!/^\d$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char;
    const newValue = newDigits.join('').replace(/\s/g, '');
    onChange(newValue);
    if (index < PIN_LENGTH - 1) {
      focusInput(index + 1);
    }
    if (newValue.length === PIN_LENGTH) {
      setTimeout(() => onComplete(), 50);
    }
  }, [digits, onChange, focusInput, onComplete]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (digits[index] && digits[index] !== ' ') {
        newDigits[index] = ' ';
        onChange(newDigits.join('').trimEnd());
      } else if (index > 0) {
        newDigits[index - 1] = ' ';
        onChange(newDigits.join('').trimEnd());
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight') {
      focusInput(index + 1);
    } else if (e.key === 'Enter') {
      onComplete();
    }
  }, [digits, onChange, focusInput, onComplete]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (pasted.length > 0) {
      onChange(pasted);
      focusInput(Math.min(pasted.length, PIN_LENGTH - 1));
      if (pasted.length === PIN_LENGTH) {
        setTimeout(() => onComplete(), 50);
      }
    }
  }, [onChange, focusInput, onComplete]);

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() || ''}
          disabled={disabled}
          className="w-11 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 border-input bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          autoComplete="off"
        />
      ))}
    </div>
  );
}

export default function Landing() {
  setSessionType('admin');
  const { isAuthenticated, login, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: profile } = useGetMyProfile({ query: { enabled: isAuthenticated } });

  const [studentName, setStudentName] = useState('');
  const [pin, setPin] = useState('');
  const [studentError, setStudentError] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);

  useEffect(() => {
    fetch('/api/auth/mode', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { isLocal: boolean }) => setIsLocalMode(data.isLocal))
      .catch(() => {});
  }, []);

  // No auto-redirect — landing page always shows the login options.
  // Users navigate to /workspace or /admin explicitly after login.

  const handleStudentLogin = async () => {
    setStudentError('');
    if (!studentName.trim() || pin.length !== 6) return;
    setStudentLoading(true);
    try {
      const res = await fetch('/api/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: studentName.trim(), pin }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setStudentError(data.error || 'Login failed');
        setStudentLoading(false);
        return;
      }
      window.location.href = '/workspace';
    } catch {
      setStudentError('Something went wrong. Please try again.');
      setStudentLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <nav className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold text-foreground tracking-tight">PyLearn</span>
            <span className="text-[10px] text-muted-foreground font-mono self-center">{APP_VERSION}</span>
          </div>
        </nav>

        <main className="mt-12 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6 border border-primary/20">
            <Sparkles className="w-4 h-4" />
            <span>Interactive Python Classroom</span>
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-display font-extrabold text-foreground leading-tight mb-6">
            Learn Python with <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Superpowers</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            A beautiful, intelligent workspace for students to code, explore, and get instant AI help—all visible to the teacher in real-time.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto mb-16">
            <div className="p-6 rounded-3xl bg-card border-2 border-primary/20 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold mb-4">I'm a Student</h2>
              
              <div className="space-y-3">
                <Input
                  placeholder="Your name"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  className="text-center"
                  onKeyDown={e => e.key === 'Enter' && handleStudentLogin()}
                />
                <PinInput
                  value={pin}
                  onChange={setPin}
                  onComplete={handleStudentLogin}
                  disabled={studentLoading}
                />
                {studentError && (
                  <p className="text-sm text-destructive font-medium">{studentError}</p>
                )}
                <Button
                  onClick={handleStudentLogin}
                  disabled={studentLoading || !studentName.trim() || pin.length !== 6}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
                >
                  {studentLoading ? 'Logging in...' : 'Enter Classroom'}
                </Button>
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-card border-2 border-muted shadow-lg flex flex-col">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-bold mb-4">I'm a Teacher</h2>
              {isAuthenticated && profile?.role === 'admin' ? (
                <>
                  <p className="text-sm text-muted-foreground mb-6 flex-1">
                    Welcome back, {profile.firstName || 'Teacher'}!
                  </p>
                  <Button
                    onClick={() => setLocation('/admin')}
                    className="w-full h-12 rounded-2xl"
                  >
                    Go to Dashboard
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-6 flex-1">
                    {isLocalMode
                      ? 'Click to sign in as the local teacher.'
                      : 'Sign in with your Google account to access the admin dashboard.'}
                  </p>
                  <Button
                    onClick={login}
                    variant="outline"
                    className="w-full h-12 rounded-2xl"
                  >
                    {isLocalMode ? 'Log in' : 'Sign In with Google'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 text-left">
            <div className="p-6 rounded-3xl bg-card border border-border shadow-sm">
              <Code2 className="w-10 h-10 text-primary mb-4" />
              <h3 className="font-bold text-lg mb-2">Browser-Based Editor</h3>
              <p className="text-muted-foreground">Code in Python, run text adventures, and build graphical games right in the browser.</p>
            </div>
            <div className="p-6 rounded-3xl bg-card border border-border shadow-sm">
              <Sparkles className="w-10 h-10 text-accent mb-4" />
              <h3 className="font-bold text-lg mb-2">Smart AI Assistant</h3>
              <p className="text-muted-foreground">Get help when you're stuck with visual code diffs that you can review and accept.</p>
            </div>
            <div className="p-6 rounded-3xl bg-card border border-border shadow-sm">
              <Users className="w-10 h-10 text-secondary-foreground mb-4" />
              <h3 className="font-bold text-lg mb-2">Live Teacher Help</h3>
              <p className="text-muted-foreground">Teachers can jump into your workspace and co-edit code in real-time to guide you.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
