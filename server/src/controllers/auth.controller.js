import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
  signAccessToken,
} from '../utils/token.js';

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
  login: z.object({ email, password: z.string().min(1, 'Enter your password') }),
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

  const user = await prisma.user.create({
    data: { name, email: mail, phone: phone || null, passwordHash: await bcrypt.hash(pw, 12) },
  });

  res.status(201).json({ ok: true, data: await issueSession(res, user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email: mail, password: pw } = req.body;
  const user = await prisma.user.findUnique({ where: { email: mail } });

  // Compare against a dummy hash when the user is missing so the response time
  // does not reveal whether the email is registered.
  const hash = user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const valid = await bcrypt.compare(pw, hash);

  if (!user || !valid) throw ApiError.unauthorized('Email or password is incorrect');
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
  // Force every other device to sign in again.
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  clearRefreshCookie(res);
  res.json({ ok: true, data: { message: 'Password updated. Please sign in again.' } });
});
