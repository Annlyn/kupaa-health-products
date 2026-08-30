import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const REFRESH_COOKIE = 'kupaa_rt';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
    issuer: 'kupaa-api',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { issuer: 'kupaa-api' });
}

/** Opaque, single-use refresh token persisted server-side so it can be revoked. */
export async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.jwt.refreshTtlDays * 86400_000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function rotateRefreshToken(oldToken) {
  const record = await prisma.refreshToken.findUnique({ where: { token: oldToken }, include: { user: true } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  if (!record.user || !record.user.isActive) return null;

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  const next = await issueRefreshToken(record.userId);
  return { user: record.user, refresh: next };
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  await prisma.refreshToken.updateMany({ where: { token, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: env.isProd ? 'none' : 'lax',
    secure: env.isProd,
    path: '/api/auth',
    expires: expiresAt,
  };
}

export function setRefreshCookie(res, { token, expiresAt }) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt));
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
}
