import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { WebAuthnCredential } from '@simplewebauthn/server';
import db from '../db';
import { requireAuth, signSession, setSessionCookie, clearSessionCookie } from '../middleware/auth';

const router = Router();

const RP_NAME = 'Expense Tracker';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

// Pending WebAuthn challenges, keyed by userId (registration) or username (login).
// In-memory is fine — single-user local app, ceremonies complete within seconds.
const registrationChallenges = new Map<number, string>();
const loginChallenges = new Map<string, string>();

const toBase64Url = (buf: Uint8Array) => Buffer.from(buf).toString('base64url');
const fromBase64Url = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

async function getUser(username: string) {
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
  return result.rows[0] as any | undefined;
}

async function getCredentialsForUser(userId: number) {
  const result = await db.execute({ sql: 'SELECT * FROM webauthn_credentials WHERE user_id = ?', args: [userId] });
  return result.rows as any[];
}

function rowToCredential(row: any): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: fromBase64Url(row.public_key),
    counter: Number(row.counter),
    transports: row.transports ? JSON.parse(row.transports) : undefined,
  };
}

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const users = await db.execute({ sql: 'SELECT id FROM users LIMIT 1', args: [] });
    res.json({ setupRequired: users.rows.length === 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const result = await db.execute({ sql: 'SELECT id, username FROM users WHERE id = ?', args: [req.userId!] });
  if (result.rows.length === 0) return res.status(401).json({ error: 'Not authenticated' });
  res.json(result.rows[0]);
});

router.post('/setup', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Username and a password of at least 8 characters are required' });
  }
  try {
    const existing = await db.execute({ sql: 'SELECT id FROM users LIMIT 1', args: [] });
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Account already set up' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      args: [username, passwordHash],
    });
    const userId = Number(result.lastInsertRowid);
    const token = await signSession(userId);
    setSessionCookie(res, token);
    res.status(201).json({ id: userId, username });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await getUser(username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = await signSession(Number(user.id));
    setSessionCookie(res, token);
    res.json({ id: user.id, username: user.username });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required' });
  }
  try {
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.userId!] });
    const user = result.rows[0] as any;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [passwordHash, user.id] });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/webauthn/credentials', requireAuth, async (req: Request, res: Response) => {
  const userResult = await db.execute({ sql: 'SELECT webauthn_enabled FROM users WHERE id = ?', args: [req.userId!] });
  const enabled = Boolean(Number(userResult.rows[0]?.webauthn_enabled ?? 1));
  const rows = await getCredentialsForUser(req.userId!);
  res.json({
    enabled,
    credentials: rows.map(r => ({
      id: r.id,
      device_name: r.device_name,
      transports: r.transports ? JSON.parse(r.transports) : [],
      created_at: r.created_at,
    })),
  });
});

router.delete('/webauthn/credentials/:id', requireAuth, async (req: Request, res: Response) => {
  await db.execute({
    sql: 'DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?',
    args: [Number(req.params.id), req.userId!],
  });
  res.status(204).end();
});

router.post('/webauthn/toggle', requireAuth, async (req: Request, res: Response) => {
  const enabled = !!req.body.enabled;
  await db.execute({
    sql: 'UPDATE users SET webauthn_enabled = ? WHERE id = ?',
    args: [enabled ? 1 : 0, req.userId!],
  });
  res.json({ enabled });
});

// Pre-login check: does this account have an enabled, registered fingerprint to offer?
router.get('/webauthn/availability', async (req: Request, res: Response) => {
  try {
    const username = String(req.query.username || '');
    if (!username) return res.json({ available: false });
    const user = await getUser(username);
    if (!user || !Number(user.webauthn_enabled)) return res.json({ available: false });
    const creds = await getCredentialsForUser(Number(user.id));
    res.json({ available: creds.length > 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webauthn/register-options', requireAuth, async (req: Request, res: Response) => {
  try {
    const userResult = await db.execute({ sql: 'SELECT id, username FROM users WHERE id = ?', args: [req.userId!] });
    const user = userResult.rows[0] as any;
    const existingCreds = await getCredentialsForUser(req.userId!);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.username,
      attestationType: 'none',
      excludeCredentials: existingCreds.map(c => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });

    registrationChallenges.set(req.userId!, options.challenge);
    res.json(options);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webauthn/register-verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const { response, deviceName } = req.body;
    const expectedChallenge = registrationChallenges.get(req.userId!);
    if (!expectedChallenge) return res.status(400).json({ error: 'No registration in progress' });

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    registrationChallenges.delete(req.userId!);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    const { credential } = verification.registrationInfo;
    await db.execute({
      sql: `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name, transports)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        req.userId!,
        credential.id,
        toBase64Url(credential.publicKey),
        credential.counter,
        deviceName || 'Unnamed device',
        credential.transports ? JSON.stringify(credential.transports) : null,
      ],
    });

    res.status(201).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webauthn/login-options', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const user = await getUser(username);
    if (!user) return res.status(401).json({ error: 'Invalid username' });
    if (!Number(user.webauthn_enabled)) return res.status(400).json({ error: 'Fingerprint sign-in is disabled for this account' });

    const creds = await getCredentialsForUser(Number(user.id));
    if (creds.length === 0) return res.status(400).json({ error: 'No fingerprint registered for this account' });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: creds.map(c => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
    });

    loginChallenges.set(username, options.challenge);
    res.json(options);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/webauthn/login-verify', async (req: Request, res: Response) => {
  try {
    const { username, response } = req.body;
    const expectedChallenge = loginChallenges.get(username);
    if (!expectedChallenge) return res.status(400).json({ error: 'No login in progress' });

    const user = await getUser(username);
    if (!user) return res.status(401).json({ error: 'Invalid username' });

    const credResult = await db.execute({
      sql: 'SELECT * FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
      args: [response.id, user.id],
    });
    const credRow = credResult.rows[0] as any;
    if (!credRow) return res.status(401).json({ error: 'Unknown credential' });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: rowToCredential(credRow),
    });
    loginChallenges.delete(username);

    if (!verification.verified) return res.status(401).json({ error: 'Verification failed' });

    await db.execute({
      sql: 'UPDATE webauthn_credentials SET counter = ? WHERE id = ?',
      args: [verification.authenticationInfo.newCounter, credRow.id],
    });

    const token = await signSession(Number(user.id));
    setSessionCookie(res, token);
    res.json({ id: user.id, username: user.username });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
