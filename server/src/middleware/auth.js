import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { verifyAccessToken } from '../utils/token.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Populates req.user when a valid token is present; never rejects. */
export async function attachUser(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
    });
    if (user?.isActive) req.user = user;
  } catch {
    // expired / tampered token — treated as anonymous, client will refresh
  }
  return next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  return next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'ADMIN') return next(ApiError.forbidden('Admin access required'));
  return next();
}
