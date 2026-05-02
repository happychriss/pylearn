import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

// Session type getter — set by the app layer for dual-session support
let _sessionTypeGetter: (() => string) | null = null;

export function setAuthSessionTypeGetter(getter: () => string) {
  _sessionTypeGetter = getter;
}

const AUTH_POLL_INTERVAL_MS = 30_000;

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = () => {
      const headers: Record<string, string> = {};
      if (_sessionTypeGetter) {
        headers["x-session-type"] = _sessionTypeGetter();
      }
      return fetch("/api/auth/user", { credentials: "include", headers })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ user: AuthUser | null }>;
        })
        .then((data) => {
          if (!cancelled) {
            setUser(data.user ?? null);
            setIsLoading(false);
          }
        })
        .catch(() => {
          // Network error — don't clear the user so students can keep working
          // through a brief WiFi blip. Only an explicit null from the server
          // clears the session.
          if (!cancelled) setIsLoading(false);
        });
    };

    checkAuth();
    const interval = setInterval(checkAuth, AUTH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const login = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
