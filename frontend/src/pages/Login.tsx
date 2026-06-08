import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Lock, User } from 'lucide-react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from '../api';
import type { AuthUser } from '../api';
import { useAuth } from '../contexts/AuthContext';

const LAST_USERNAME_KEY = 'expense-tracker:last-username';

export default function Login() {
  const navigate = useNavigate();
  const { state, setAuthenticated } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem(LAST_USERNAME_KEY) || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fingerprintAvailable, setFingerprintAvailable] = useState(false);
  const autoTriedRef = useRef(false);
  const checkedUsernameRef = useRef('');

  const setupRequired = state.status === 'setup-required';

  const onSignedIn = (user: AuthUser, name: string) => {
    localStorage.setItem(LAST_USERNAME_KEY, name);
    setAuthenticated(user);
    navigate('/', { replace: true });
  };

  const checkFingerprintAvailability = async (targetUsername: string) => {
    if (!targetUsername || !browserSupportsWebAuthn()) {
      setFingerprintAvailable(false);
      return;
    }
    if (checkedUsernameRef.current === targetUsername) return;
    checkedUsernameRef.current = targetUsername;
    try {
      const { available } = await api.getFingerprintAvailability(targetUsername);
      setFingerprintAvailable(available);
    } catch {
      setFingerprintAvailable(false);
    }
  };

  const attemptFingerprintLogin = async (targetUsername: string, opts?: { silent?: boolean }) => {
    if (!targetUsername) {
      if (!opts?.silent) setError('Enter your username first');
      return;
    }
    if (!opts?.silent) setError(null);
    setBusy(true);
    try {
      const optionsJSON = await api.webauthnLoginOptions(targetUsername);
      const response = await startAuthentication({ optionsJSON });
      const user = await api.webauthnLoginVerify(targetUsername, response);
      onSignedIn(user, targetUsername);
    } catch (err: any) {
      if (!opts?.silent) setError(err.message || 'Fingerprint sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  // Remembered device: pre-fill username and prompt fingerprint immediately on load.
  // Wrong person can cancel the OS prompt and switch accounts manually below.
  useEffect(() => {
    if (autoTriedRef.current) return;
    if (state.status !== 'unauthenticated') return;
    if (!browserSupportsWebAuthn()) return;
    const saved = localStorage.getItem(LAST_USERNAME_KEY);
    if (!saved) return;
    autoTriedRef.current = true;
    checkFingerprintAvailability(saved);
    attemptFingerprintLogin(saved, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setupRequired && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const user = setupRequired
        ? await api.setup(username, password)
        : await api.login(username, password);
      onSignedIn(user, username);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line p-6 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-ink">{setupRequired ? 'Set up your account' : 'Sign in'}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {setupRequired
              ? 'Create the account that will protect this expense tracker.'
              : 'Budget & Expense Tracker'}
          </p>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onBlur={e => checkFingerprintAvailability(e.target.value.trim())}
              autoComplete="username"
              autoFocus
              className="w-full border border-line rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={setupRequired ? 'new-password' : 'current-password'}
              className="w-full border border-line rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {setupRequired && (
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-line rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2.5 text-sm font-semibold bg-accent text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {setupRequired ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {!setupRequired && fingerprintAvailable && (
          <button
            onClick={() => attemptFingerprintLogin(username)}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm border border-line-strong text-ink-muted rounded-xl hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <Fingerprint size={16} /> Sign in with fingerprint
          </button>
        )}
      </div>
    </div>
  );
}
