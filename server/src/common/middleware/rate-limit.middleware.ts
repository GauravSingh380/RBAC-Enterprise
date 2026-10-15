import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';

/** Per-IP rate limiter. Disabled in the automated test run (NODE_ENV=test). */
export function createRateLimiter(windowMinutes: number, limit: number, message = 'Too many attempts, please try again later') {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.nodeEnv === 'test',
    message: { success: false, message },
  });
}

/** Brute-force protection for login / register / reset password. */
export const authRateLimiter = createRateLimiter(15, 20);

/** "Forgot password" sends emails — keep it tight to prevent mail flooding. */
export const passwordResetRateLimiter = createRateLimiter(15, 5, 'Too many reset requests, please try again later');
