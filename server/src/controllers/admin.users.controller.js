import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { round2 } from '../utils/money.js';
import { like } from '../lib/search.js';

export const schemas = {
  list: z.object({
    q: z.string().trim().optional(),
    role: z.enum(['all', 'USER', 'ADMIN']).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  update: z.object({ role: z.enum(['USER', 'ADMIN']).optional(), isActive: z.boolean().optional() }),
  coupon: z.object({
    code: z.string().trim().min(3).max(24).transform((s) => s.toUpperCase()),
    description: z.string().trim().max(200).optional().or(z.literal('')),
    type: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
    value: z.coerce.number().min(0.01),
    minOrder: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    startsAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  }).refine((v) => v.type !== 'PERCENT' || v.value <= 100, { message: 'A percentage discount cannot exceed 100', path: ['value'] }),
};

// ---------------------------------------------------------------------- users

export const listUsers = asyncHandler(async (req, res) => {
  const { q, role, page, limit } = req.query;

  const where = {};
  if (role !== 'all') where.role = role;
  if (q) where.OR = [{ name: like(q) }, { email: like(q) }, { phone: like(q) }];

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Lifetime value per listed customer.
  const spend = await prisma.order.groupBy({
    by: ['userId'],
    where: { userId: { in: users.map((u) => u.id) }, status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] } },
    _sum: { total: true },
  });
  const spendBy = new Map(spend.map((s) => [s.userId, round2(s._sum.total ?? 0)]));

  res.json({
    ok: true,
    data: users.map((u) => ({ ...u, orderCount: u._count.orders, totalSpent: spendBy.get(u.id) ?? 0, _count: undefined })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
      addresses: true,
      orders: { orderBy: { placedAt: 'desc' }, take: 20, include: { items: true, shipment: true } },
    },
  });
  if (!user) throw ApiError.notFound('Customer not found');
  res.json({ ok: true, data: user });
});

export const updateUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id && (req.body.role === 'USER' || req.body.isActive === false)) {
    throw ApiError.badRequest('You cannot remove your own admin access');
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: req.body,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  // Deactivating must invalidate live sessions immediately.
  if (req.body.isActive === false) {
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  res.json({ ok: true, data: user });
});

// -------------------------------------------------------------------- coupons

const toDate = (v) => (v ? new Date(v) : null);

export const listCoupons = asyncHandler(async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ ok: true, data: coupons });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await prisma.coupon.create({
    data: {
      ...req.body,
      description: req.body.description || null,
      maxDiscount: req.body.maxDiscount ?? null,
      usageLimit: req.body.usageLimit ?? null,
      startsAt: toDate(req.body.startsAt),
      expiresAt: toDate(req.body.expiresAt),
    },
  });
  res.status(201).json({ ok: true, data: coupon });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await prisma.coupon.update({
    where: { id: req.params.id },
    data: {
      ...req.body,
      description: req.body.description || null,
      maxDiscount: req.body.maxDiscount ?? null,
      usageLimit: req.body.usageLimit ?? null,
      startsAt: toDate(req.body.startsAt),
      expiresAt: toDate(req.body.expiresAt),
    },
  });
  res.json({ ok: true, data: coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true, data: { message: 'Coupon deleted' } });
});
