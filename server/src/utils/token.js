import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const REFRESH_COOKIE = 'kupaa_rt';
export const TRUSTED_DEVICE_COOKIE = 'kupaa_td';
export const VERIFICATION_AUDIENCE = 'login-verified';

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

/**
 * Proof that this visitor just passed an OTP, handed to the password step.
 * Short-lived on purpose: it is a receipt for one sign-in, not a session.
 */
export function signVerificationToken(userId, challengeId) {
  return jwt.sign({ sub: userId, jti: challengeId }, env.jwt.accessSecret, {
    expiresIn: '15m',
    issuer: 'kupaa-api',
    audience: VERIFICATION_AUDIENCE,
  });
}

export function verifyVerificationToken(token) {
  try {
    return jwt.verify(token, env.jwt.accessSecret, { issuer: 'kupaa-api', audience: VERIFICATION_AUDIENCE });
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- trusted device

const hashDeviceToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Remembers this browser so the next sign-in skips the code. */
export async function trustDevice(userId, label) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.auth.trustedDeviceDays * 86400_000);
  await prisma.trustedDevice.create({ data: { userId, tokenHash: hashDeviceToken(token), label: label || null, expiresAt } });
  return { token, expiresAt };
}

/**
 * True when the cookie on this request belongs to `userId` and is still live.
 * Touching `lastUsedAt` keeps the list under Devices meaningful.
 */
export async function isDeviceTrusted(token, userId) {
  if (!token) return false;

  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashDeviceToken(token) } });
  if (!device || device.userId !== userId || device.expiresAt < new Date()) return false;

  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
}

/** Called when a password changes: every browser has to verify again. */
export const revokeTrustedDevices = (userId) => prisma.trustedDevice.deleteMany({ where: { userId } });

export function trustedDeviceCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: env.isProd ? 'none' : 'lax',
    secure: env.isProd,
    path: '/api/auth',
    expires: expiresAt,
  };
}

export function setTrustedDeviceCookie(res, { token, expiresAt }) {
  res.cookie(TRUSTED_DEVICE_COOKIE, token, trustedDeviceCookieOptions(expiresAt));
}
