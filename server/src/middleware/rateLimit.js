import rateLimit from 'express-rate-limit';

const common = { standardHeaders: true, legacyHeaders: false };

export const apiLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 300,
  message: { ok: false, error: { message: 'Too many requests, please slow down' } },
});

/** Brute-force protection on credential endpoints. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: { ok: false, error: { message: 'Too many attempts. Try again in a few minutes.' } },
});

export const writeLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 60 });
