import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { like } from '../lib/search.js';

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Pick a rating').max(5),
  title: z.string().trim().max(100).optional().or(z.literal('')),
  comment: z.string().trim().max(1500).optional().or(z.literal('')),
});

/** Recomputes the denormalised rating columns on Product. */
export async function refreshRating(productId) {
  const agg = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      ratingCount: agg._count.rating,
    },
  });
}

export const listForProduct = asyncHandler(async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { product: { slug: req.params.slug } },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  });
  res.json({ ok: true, data: reviews.map((r) => ({ ...r, user: undefined, author: r.user.name })) });
});

export const upsert = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
  if (!product) throw ApiError.notFound('Product not found');

  const purchased = await prisma.orderItem.findFirst({
    where: {
      productId: product.id,
      order: { userId: req.user.id, status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] } },
    },
    select: { id: true },
  });
  if (!purchased) throw ApiError.forbidden('Only customers who bought this product can review it');

  const data = { ...req.body, title: req.body.title || null, comment: req.body.comment || null };
  const review = await prisma.review.upsert({
    where: { productId_userId: { productId: product.id, userId: req.user.id } },
    create: { ...data, productId: product.id, userId: req.user.id },
    update: data,
  });

  await refreshRating(product.id);
  res.status(201).json({ ok: true, data: review });
});

export const remove = asyncHandler(async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw ApiError.notFound('Review not found');
  if (review.userId !== req.user.id && req.user.role !== 'ADMIN') throw ApiError.forbidden();

  await prisma.review.delete({ where: { id: review.id } });
  await refreshRating(review.productId);
  res.json({ ok: true, data: { message: 'Review removed' } });
});

// -------------------------------------------------------------------- admin

export const adminListSchema = z.object({
  q: z.string().trim().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/admin/reviews — moderation queue across every product. */
export const adminList = asyncHandler(async (req, res) => {
  const { q, rating, page, limit } = req.query;

  const where = {};
  if (rating) where.rating = rating;
  if (q) {
    where.OR = [
      { title: like(q) },
      { comment: like(q) },
      { product: { name: like(q) } },
      { user: { name: like(q) } },
      { user: { email: like(q) } },
    ];
  }

  const [reviews, total, breakdown] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ['rating'], _count: { rating: true } }),
  ]);

  res.json({
    ok: true,
    data: reviews,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      breakdown: [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: breakdown.find((b) => b.rating === star)?._count.rating ?? 0,
      })),
    },
  });
});

/** DELETE /api/admin/reviews/:id — remove a review and refresh the product rating. */
export const adminRemove = asyncHandler(async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw ApiError.notFound('Review not found');

  await prisma.review.delete({ where: { id: review.id } });
  await refreshRating(review.productId);

  res.json({ ok: true, data: { message: 'Review removed' } });
});
