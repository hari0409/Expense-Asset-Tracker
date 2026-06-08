import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { MonthlyIncome, WebauthnCredentialInfo } from '../api';
import { Share2, Wallet, Pencil, Check, X, Fingerprint, Trash2, ShieldCheck, KeyRound } from 'lucide-react';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';

const now = new Date();
const CUR_MONTH = now.getMonth() + 1;
const CUR_YEAR = now.getFullYear();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function Config() {
  const navigate = useNavigate();
  const [income, setIncome] = useState<MonthlyIncome | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const [credentials, setCredentials] = useState<WebauthnCredentialInfo[]>([]);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [togglingFingerprint, setTogglingFingerprint] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const loadCredentials = () => api.getCredentials().then(s => {
    setCredentials(s.credentials);
    setFingerprintEnabled(s.enabled);
  }).catch(() => {});

  useEffect(() => { api.getIncome(CUR_MONTH, CUR_YEAR).then(setIncome).catch(() => {}); }, []);
  useEffect(() => { loadCredentials(); }, []);

  const registerDevice = async () => {
    setSecurityError(null);
    setRegistering(true);
    try {
      const optionsJSON = await api.webauthnRegisterOptions();
      const response = await startRegistration({ optionsJSON });
      const deviceName = window.prompt('Name this device (e.g. "MacBook Touch ID")', 'My device') || 'My device';
      await api.webauthnRegisterVerify(response, deviceName);
      await loadCredentials();
    } catch (err: any) {
      setSecurityError(err.message || 'Could not register device');
    } finally {
      setRegistering(false);
    }
  };

  const removeDevice = async (id: number) => {
    if (!window.confirm('Remove this device? You will no longer be able to sign in with it.')) return;
    await api.deleteCredential(id);
    await loadCredentials();
  };

  const toggleFingerprint = async () => {
    setSecurityError(null);
    setTogglingFingerprint(true);
    try {
      const { enabled } = await api.setFingerprintEnabled(!fingerprintEnabled);
      setFingerprintEnabled(enabled);
    } catch (err: any) {
      setSecurityError(err.message || 'Could not change fingerprint setting');
    } finally {
      setTogglingFingerprint(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'Password updated' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Could not change password' });
    } finally {
      setChangingPassword(false);
    }
  };

  const save = async () => {
    const n = Number(value);
    if (!n || n <= 0) return;
    const result = await api.setIncome({ month: CUR_MONTH, year: CUR_YEAR, amount: n });
    setIncome(result);
    setEditing(false);
  };

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold text-ink">Config</h1>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink-muted mb-3">Salary</h2>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-medium uppercase tracking-wider">
            <Wallet size={14} className="text-violet-500" />
            Monthly income
          </div>
          {!editing && (
            <button onClick={() => { setValue(income ? String(income.amount) : ''); setEditing(true); }} className="text-ink-faint hover:text-ink">
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-ink-faint text-sm">₹</span>
            <input
              type="number"
              className="flex-1 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
            />
            <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={18} /></button>
            <button onClick={() => setEditing(false)} className="text-ink-faint hover:text-ink"><X size={18} /></button>
          </div>
        ) : income ? (
          <div>
            <p className="text-xl font-bold text-violet-400">{fmt(income.amount)}</p>
            {(income.month !== CUR_MONTH || income.year !== CUR_YEAR) && (
              <p className="text-[11px] text-ink-faint mt-0.5">Carried from {MONTHS[income.month - 1]} {income.year}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-faint italic">Not set — click pencil to add</p>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink-muted mb-3">Savings mapping</h2>
        <p className="text-sm text-ink-muted mb-3">Map savings instruments to net-worth assets so contributions flow through automatically.</p>
        <button
          onClick={() => navigate('/savings/mapping')}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink-muted rounded-lg hover:bg-surface-2 transition-colors"
        >
          <Share2 size={15} /> Mapping config
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink-muted mb-1 flex items-center gap-2">
          <ShieldCheck size={15} className="text-violet-500" /> Security
        </h2>
        <p className="text-sm text-ink-muted mb-3">Sign in faster with your device's fingerprint sensor instead of typing your password.</p>

        {credentials.length > 0 && (
          <>
            <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-lg border border-line bg-surface-2">
              <span className="text-sm text-ink">Fingerprint sign-in</span>
              <button
                onClick={toggleFingerprint}
                disabled={togglingFingerprint}
                className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${fingerprintEnabled ? 'bg-accent' : 'bg-line-strong'}`}
                aria-pressed={fingerprintEnabled}
                title={fingerprintEnabled ? 'Disable fingerprint sign-in' : 'Enable fingerprint sign-in'}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${fingerprintEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            {!fingerprintEnabled && (
              <p className="text-[11px] text-ink-faint mb-2">Fingerprint sign-in is temporarily disabled — your registered devices stay listed but won't be offered at login.</p>
            )}
            <ul className="space-y-2 mb-3">
              {credentials.map(c => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-line bg-surface-2">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <Fingerprint size={15} className="text-ink-faint" />
                    {c.device_name || 'Unnamed device'}
                  </div>
                  <button onClick={() => removeDevice(c.id)} className="text-ink-faint hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {securityError && <p className="text-xs text-red-400 mb-2">{securityError}</p>}

        {browserSupportsWebAuthn() ? (
          <button
            onClick={registerDevice}
            disabled={registering}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink-muted rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <Fingerprint size={15} /> {registering ? 'Waiting for fingerprint…' : 'Register this device'}
          </button>
        ) : (
          <p className="text-xs text-ink-faint italic">This browser doesn't support fingerprint sign-in.</p>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink-muted mb-1 flex items-center gap-2">
          <KeyRound size={15} className="text-violet-500" /> Change password
        </h2>
        <p className="text-sm text-ink-muted mb-3">Update the password used to sign in.</p>

        <form onSubmit={changePassword} className="space-y-3 max-w-sm">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />

          {passwordMsg && (
            <p className={`text-xs ${passwordMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{passwordMsg.text}</p>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="px-3 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {changingPassword ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
