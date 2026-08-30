import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { productCard, withVariantSummary } from './product.controller.js';

export const list = asyncHandler(async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: productCard } },
  });
  res.json({ ok: true, data: rows.map((r) => withVariantSummary(r.product)) });
});

/** Idempotent add/remove so the heart button can be a single call. */
export const toggle = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const key = { userId_productId: { userId: req.user.id, productId } };
  const existing = await prisma.wishlistItem.findUnique({ where: key });

  if (existing) {
    await prisma.wishlistItem.delete({ where: key });
    return res.json({ ok: true, data: { productId, wishlisted: false } });
  }
  await prisma.wishlistItem.create({ data: { userId: req.user.id, productId } });
  res.status(201).json({ ok: true, data: { productId, wishlisted: true } });
});
