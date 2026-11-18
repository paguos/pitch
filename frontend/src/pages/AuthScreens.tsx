import { FormEvent, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthFrame } from '../components/AuthFrame';
import { Button, Input } from '../components/ui';

const LOGIN_ERRORS: Record<string, string> = {
  not_invited:
    "This Google account isn't on the roster. Ask an admin to add your email to your player, then try again.",
  failed: "Google sign-in didn't finish. Try again.",
  google_unavailable: 'Google sign-in is unavailable right now. Try again in a moment, or use the admin sign-in.',
};

export function LoadingScreen() {
  return (
    <div className="min-h-full flex items-center justify-center font-mono text-[12px] uppercase tracking-widest2 text-bone/60">
      loading…
    </div>
  );
}

export function ServerDownScreen() {
  const { refresh } = useAuth();
  return (
    <AuthFrame title="Can't reach the server">
      <p className="mt-4 text-[14px] text-bone/75 leading-relaxed">
        The backend isn&apos;t answering. Check that it is running, then retry.
      </p>
      <Button className="mt-6 w-full" onClick={() => refresh()}>Retry</Button>
    </AuthFrame>
  );
}

// First run: no admin exists yet, so whoever opens the app first picks the
// admin password. After that this screen is never shown again.
export function SetupPage() {
  const { refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 12) return setErr('Use at least 12 characters.');
    if (password !== confirm) return setErr("The two passwords don't match.");
    setBusy(true);
    try {
      await api.setup(password);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
      // Someone else finished setup first: fall through to the sign-in screen.
      if (e.status === 409) await refresh();
    }
  }

  return (
    <AuthFrame title="Set up Pitch">
      <p className="mt-4 text-[14px] text-bone/75 leading-relaxed">
        Choose a password for the <span className="font-mono text-bone">admin</span> account. Admins
        manage players, run tournaments and decide who else can sign in.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="setup-password" className="label-eyebrow block mb-1">Password</label>
          <Input
            id="setup-password" type="password" autoComplete="new-password" autoFocus required
            data-testid="setup-password"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-[12px] text-bone/55">At least 12 characters.</p>
        </div>
        <div>
          <label htmlFor="setup-confirm" className="label-eyebrow block mb-1">Confirm password</label>
          <Input
            id="setup-confirm" type="password" autoComplete="new-password" required
            data-testid="setup-confirm"
            value={confirm} onChange={e => setConfirm(e.target.value)}
          />
        </div>
        {err && <div role="alert" className="text-coral font-mono text-xs">{err}</div>}
        <Button type="submit" className="w-full" disabled={busy} data-testid="setup-submit">
          {busy ? '…' : 'Create admin account'}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function LoginPage() {
  const { googleEnabled, refresh } = useAuth();
  const location = useLocation();
  const [showAdmin, setShowAdmin] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const code = new URLSearchParams(location.search).get('error');
  const redirectError = code ? LOGIN_ERRORS[code] ?? LOGIN_ERRORS.failed : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.login(username, password);
      await refresh();
    } catch (e: any) {
      setErr(e.status === 401 ? 'Wrong username or password.' : e.message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in">
      {redirectError && (
        <div role="alert" data-testid="login-error" className="mt-4 border border-coral/50 bg-coral/10 px-3 py-2 text-[13px] text-coral leading-snug">
          {redirectError}
        </div>
      )}
      <p className="mt-4 text-[14px] text-bone/75 leading-relaxed">
        Players sign in with the Google account their admin added to the roster.
      </p>

      {googleEnabled ? (
        <a
          href={`${API_BASE}/auth/google/start`}
          data-testid="google-signin"
          className="mt-6 inline-flex w-full items-center justify-center px-4 py-2.5 font-mono text-[13px] uppercase tracking-widest2 bg-pitch text-ink hover:bg-pitch/90 active:translate-y-px transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone"
        >
          Sign in with Google
        </a>
      ) : (
        <p className="mt-6 text-[13px] text-bone/60">
          Google sign-in isn&apos;t configured on this server. Use the admin sign-in below.
        </p>
      )}

      <div className="mt-8 border-t border-hairline pt-5">
        {showAdmin ? (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="label-eyebrow block mb-1">Username</label>
              <Input
                id="login-username" autoComplete="username" required
                data-testid="login-username"
                value={username} onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label-eyebrow block mb-1">Password</label>
              <Input
                id="login-password" type="password" autoComplete="current-password" autoFocus required
                data-testid="login-password"
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
            {err && <div role="alert" className="text-coral font-mono text-xs">{err}</div>}
            <Button type="submit" variant="ghost" className="w-full" disabled={busy} data-testid="login-submit">
              {busy ? '…' : 'Sign in as admin'}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdmin(true)}
            data-testid="login-admin-toggle"
            className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch"
          >
            Admin sign-in
          </button>
        )}
      </div>
    </AuthFrame>
  );
}
