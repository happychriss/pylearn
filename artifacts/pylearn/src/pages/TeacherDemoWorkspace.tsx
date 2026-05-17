import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { setSessionType } from '@/lib/session-type';
import StudentWorkspace from './StudentWorkspace';

export default function TeacherDemoWorkspace() {
  // Use admin session type for the setup call — switched to student after setup completes
  setSessionType('admin');
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/demo-workspace/setup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Session-Type': 'admin', 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (r.ok) {
          setReady(true);
        } else {
          const d = await r.json().catch(() => ({}));
          setError((d as { error?: string }).error ?? 'Setup failed');
        }
      })
      .catch(() => setError('Network error — could not reach server'));
  }, []);

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive font-medium">{error}</p>
          <button
            className="text-sm text-primary underline"
            onClick={() => setLocation('/admin')}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background text-muted-foreground text-sm">
        Setting up demo workspace…
      </div>
    );
  }

  return <StudentWorkspace isTeacherDemo />;
}
