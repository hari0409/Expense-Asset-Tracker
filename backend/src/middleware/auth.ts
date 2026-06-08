import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db';

export const SESSION_COOKIE = 'session';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

let cachedSecret: string | null = null;

export async function getJwtSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const existing = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = 'jwt_secret'`, args: [] });
  if (existing.rows.length > 0) {
    cachedSecret = String(existing.rows[0].value);
    return cachedSecret;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  await db.execute({ sql: `INSERT INTO app_meta (key, value) VALUES ('jwt_secret', ?)`, args: [secret] });
  cachedSecret = secret;
  return secret;
}

export async function signSession(userId: number): Promise<string> {
  const secret = await getJwtSecret();
  return jwt.sign({ uid: userId }, secret, { expiresIn: '30d' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const secret = await getJwtSecret();
    const payload = jwt.verify(token, secret) as { uid: number };
    req.userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
