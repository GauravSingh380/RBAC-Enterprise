import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { UnauthorizedException } from '../exceptions/http.exception.js';

interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

export function signAccessToken(userId: number): string {
  const payload: AccessTokenPayload = { sub: String(userId), type: 'access' };
  return jwt.sign(payload, env.auth.jwtSecret, {
    expiresIn: env.auth.accessTokenTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Returns the user id stored in a valid access token, otherwise throws 401. */
export function verifyAccessToken(token: string): number {
  try {
    const payload = jwt.verify(token, env.auth.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.type !== 'access' || !payload.sub) {
      throw new Error('Invalid payload');
    }
    return Number(payload.sub);
  } catch {
    throw new UnauthorizedException('Invalid or expired access token');
  }
}

/** Random, URL-safe secret (refresh tokens, invitation links). Only its hash is stored in the database. */
export function generateSecureToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export const generateRefreshToken = generateSecureToken;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------- realtime stream tickets
// The browser's EventSource cannot send an Authorization header, so the client first asks
// POST /api/realtime/ticket (normal Bearer auth) for a short-lived signed ticket and opens
// GET /api/realtime/stream?ticket=... with it. The ticket is useless as an access token
// (different "type" + audience) and expires after 60 seconds.

export const REALTIME_TICKET_TTL_SECONDS = 60;

export function signRealtimeTicket(userId: number, organizationId: number): string {
  return jwt.sign({ sub: String(userId), org: organizationId, type: 'realtime' }, env.auth.jwtSecret, {
    expiresIn: REALTIME_TICKET_TTL_SECONDS,
    audience: 'realtime',
    algorithm: 'HS256',
  });
}

export function verifyRealtimeTicket(ticket: string): { userId: number; organizationId: number } {
  try {
    const payload = jwt.verify(ticket, env.auth.jwtSecret, { algorithms: ['HS256'], audience: 'realtime' });
    if (typeof payload === 'string' || payload.type !== 'realtime' || !payload.sub || !payload.org) throw new Error('Invalid payload');
    return { userId: Number(payload.sub), organizationId: Number(payload.org) };
  } catch {
    throw new UnauthorizedException('Invalid or expired realtime ticket');
  }
}
