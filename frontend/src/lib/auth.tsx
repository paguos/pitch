import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, AuthStatus, SessionUser, setUnauthorizedHandler } from './api';

type AuthState = {
  // 'loading' until the first /auth/status answer arrives.
  phase: 'loading' | 'error' | 'ready';
  setupRequired: boolean;
  googleEnabled: boolean;
  user: SessionUser | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthState['phase']>('loading');
  const [status, setStatus] = useState<AuthStatus>({ setup_required: false, google_enabled: false, user: null });

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.authStatus());
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // An expired session on any data request sends the user back to sign-in.
  useEffect(() => {
    setUnauthorizedHandler(() => setStatus(s => (s.user ? { ...s, user: null } : s)));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } finally { setStatus(s => ({ ...s, user: null })); }
  }, []);

  const value = useMemo<AuthState>(() => ({
    phase,
    setupRequired: status.setup_required,
    googleEnabled: status.google_enabled,
    user: status.user,
    isAdmin: status.user?.role === 'admin',
    refresh,
    signOut,
  }), [phase, status, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
