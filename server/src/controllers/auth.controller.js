import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  REFRESH_COOKIE,
  TRUSTED_DEVICE_COOKIE,
  clearRefreshCookie,
  isDeviceTrusted,
  issueRefreshToken,
  revokeRefreshToken,
  revokeTrustedDevices,
  rotateRefreshToken,
  setRefreshCookie,
  setTrustedDeviceCookie,
  signAccessToken,
  signVerificationToken,
  trustDevice,
  verifyVerificationToken,
} from '../utils/token.js';
import {
  findUserByIdentifier,
  resendLoginChallenge,
  startLoginChallenge,
  verifyLoginChallenge,
} from '../services/otp.service.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const schemas = {
  register: z.object({
    name: z.string().trim().min(2, 'Please enter your name').max(80),
    email,
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().or(z.literal('')),
    password,
  }),
  // The identifier is an email address or a 10-digit mobile number; `email` is
  // still accepted so an older client keeps working.
  loginStart: z
    .object({
      identifier: z.string().trim().min(3, 'Enter your email or mobile number').max(120).optional(),
      email: z.string().trim().max(120).optional(),
    })
    .refine((v) => v.identifier || v.email, { message: 'Enter your email or mobile number', path: ['identifier'] }),
  loginVerify: z.object({
    challengeId: z.string().min(1),
    code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code we sent you'),
  }),
  loginResend: z.object({ challengeId: z.string().min(1) }),
  login: z
    .object({
      identifier: z.string().trim().min(3).max(120).optional(),
      email: z.string().trim().max(120).optional(),
      password: z.string().min(1, 'Enter your password'),
      verificationToken: z.string().optional(),
    })
    .refine((v) => v.identifier || v.email, { message: 'Enter your email or mobile number', path: ['identifier'] }),
  updateProfile: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().or(z.literal('')),
  }),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password }),
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt });

async function issueSession(res, user) {
  const refresh = await issueRefreshToken(user.id);
  setRefreshCookie(res, refresh);
  return { user: publicUser(user), accessToken: signAccessToken(user) };
}

export const register = asyncHandler(async (req, res) => {
  const { name, email: mail, phone, password: pw } = req.body;

  const existing = await prisma.user.findUnique({ where: { email: mail } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  // A number can only sign one account in, so it cannot be shared.
  if (phone && (await prisma.user.findUnique({ where: { phone } }))) {
    throw ApiError.conflict('An account with this mobile number already exists');
  }

  const user = await prisma.user.create({
    data: { name, email: mail, phone: phone || null, passwordHash: await bcrypt.hash(pw, 12) },
  });

  res.status(201).json({ ok: true, data: await issueSession(res, user) });
});

const identifierOf = (body) => String(body.identifier || body.email || '').trim();

/**
 * POST /api/auth/login/start — step one: who are you?
 *
 * Answers with the next step. A browser that has already verified this account
 * goes straight to the password; everyone else gets a code. The shape is the
 * same whether or not the identifier is registered, so this cannot be used to
 * find out which emails or numbers have accounts.
 */
export const loginStart = asyncHandler(async (req, res) => {
  const identifier = identifierOf(req.body);

  if (!env.auth.otpEnabled) return res.json({ ok: true, data: { step: 'PASSWORD', verification: 'disabled' } });

  const user = await findUserByIdentifier(identifier);
  if (user && (await isDeviceTrusted(req.cookies?.[TRUSTED_DEVICE_COOKIE], user.id))) {
    return res.json({ ok: true, data: { step: 'PASSWORD', verification: 'trusted-device' } });
  }

  res.json({ ok: true, data: { step: 'OTP', ...(await startLoginChallenge(identifier)) } });
});

/** POST /api/auth/login/resend — same identifier, new code. */
export const loginResend = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: { step: 'OTP', ...(await resendLoginChallenge(req.body.challengeId)) } });
});

/**
 * POST /api/auth/login/verify — step two: the code.
 *
 * Success hands back a short-lived receipt for the password step and remembers
 * the browser, which is what stops the code being asked for every time.
 */
export const loginVerify = asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body;
  const { userId } = await verifyLoginChallenge({ challengeId, code });

  const device = await trustDevice(userId, req.headers['user-agent']?.slice(0, 120));
  setTrustedDeviceCookie(res, device);

  res.json({
    ok: true,
    data: {
      step: 'PASSWORD',
      verificationToken: signVerificationToken(userId, challengeId),
      trustedUntil: device.expiresAt,
    },
  });
});

/**
 * POST /api/auth/login — step three: the password.
 *
 * Requires the identifier to have been verified, either by the receipt from the
 * code step or by this browser already being trusted.
 */
export const login = asyncHandler(async (req, res) => {
  const identifier = identifierOf(req.body);
  const { password: pw, verificationToken } = req.body;
  const user = await findUserByIdentifier(identifier);

  if (env.auth.otpEnabled && user) {
    const receipt = verificationToken ? verifyVerificationToken(verificationToken) : null;
    const verified =
      receipt?.sub === user.id || (await isDeviceTrusted(req.cookies?.[TRUSTED_DEVICE_COOKIE], user.id));
    if (!verified) throw ApiError.unauthorized('Verify your email or mobile number before signing in');
  }

  // Compare against a dummy hash when the user is missing so the response time
  // does not reveal whether the identifier is registered.
  const hash = user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const valid = await bcrypt.compare(pw, hash);

  if (!user || !valid) throw ApiError.unauthorized('Those sign-in details are incorrect');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  res.json({ ok: true, data: await issueSession(res, user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Session expired, please sign in again');

  const rotated = await rotateRefreshToken(token);
  if (!rotated) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  setRefreshCookie(res, rotated.refresh);
  res.json({ ok: true, data: { user: publicUser(rotated.user), accessToken: signAccessToken(rotated.user) } });
});

export const logout = asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.json({ ok: true, data: { message: 'Signed out' } });
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const [orders, wishlist] = await Promise.all([
    prisma.order.count({ where: { userId: req.user.id } }),
    prisma.wishlistItem.count({ where: { userId: req.user.id } }),
  ]);
  res.json({ ok: true, data: { user: publicUser(user), stats: { orders, wishlist } } });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { ...req.body, phone: req.body.phone || null },
  });
  res.json({ ok: true, data: { user: publicUser(user) } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Your current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12) },
  });
  // Force every other device to sign in again — and to verify again, since a
  // password change is what someone does after losing control of an account.
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await revokeTrustedDevices(user.id);
  clearRefreshCookie(res);
  res.json({ ok: true, data: { message: 'Password updated. Please sign in again.' } });
});
