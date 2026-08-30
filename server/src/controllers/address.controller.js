import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const addressSchema = z.object({
  label: z.string().trim().max(24).default('Home'),
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().trim().min(4, 'Enter the house / street').max(160),
  line2: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().default('India'),
  isDefault: z.boolean().default(false),
});

export const list = asyncHandler(async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ ok: true, data: addresses });
});

export const create = asyncHandler(async (req, res) => {
  const count = await prisma.address.count({ where: { userId: req.user.id } });
  const isDefault = req.body.isDefault || count === 0;

  if (isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });

  const address = await prisma.address.create({
    data: { ...req.body, line2: req.body.line2 || null, isDefault, userId: req.user.id },
  });
  res.status(201).json({ ok: true, data: address });
});

export const update = asyncHandler(async (req, res) => {
  const owned = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!owned) throw ApiError.notFound('Address not found');

  if (req.body.isDefault) await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });

  const address = await prisma.address.update({
    where: { id: owned.id },
    data: { ...req.body, line2: req.body.line2 || null },
  });
  res.json({ ok: true, data: address });
});

export const remove = asyncHandler(async (req, res) => {
  const owned = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!owned) throw ApiError.notFound('Address not found');

  await prisma.address.delete({ where: { id: owned.id } });

  // Keep exactly one default address alive.
  if (owned.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  res.json({ ok: true, data: { message: 'Address removed' } });
});
