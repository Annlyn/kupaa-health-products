import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { summarise, variantSelect } from '../services/variant.service.js';
import { like } from '../lib/search.js';

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().optional(), // slug
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  tag: z.string().trim().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'name']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
});

const ORDER_BY = {
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ price: 'asc' }],
  price_desc: [{ price: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
  name: [{ name: 'asc' }],
};

export const productCard = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDesc: true,
  price: true,
  mrp: true,
  stock: true,
  isFeatured: true,
  ratingAvg: true,
  ratingCount: true,
  tags: true,
  createdAt: true,
  variantLabel: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' } },
  variants: { where: { isActive: true }, select: variantSelect, orderBy: { sortOrder: 'asc' } },
};

/** Adds the price range and total stock a card needs to render "from ₹499". */
export const withVariantSummary = (product) => ({ ...product, ...summarise(product) });

/** GET /api/products */
export const list = asyncHandler(async (req, res) => {
  const { q, category, minPrice, maxPrice, inStock, featured, tag, sort, page, limit } = req.query;

  const where = { isActive: true };
  if (category) where.category = { slug: category };
  if (featured === 'true') where.isFeatured = true;
  if (inStock === 'true') where.stock = { gt: 0 };
  if (minPrice != null || maxPrice != null) {
    where.price = {};
    if (minPrice != null) where.price.gte = minPrice;
    if (maxPrice != null) where.price.lte = maxPrice;
  }
  if (tag) where.tags = like(tag);
  if (q) {
    where.OR = [
      { name: like(q) },
      { shortDesc: like(q) },
      { description: like(q) },
      { tags: like(q) },
      { sku: like(q) },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productCard,
      orderBy: ORDER_BY[sort],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({
    ok: true,
    data: items.map(withVariantSummary),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/products/facets — price range + categories, for the filter sidebar */
export const facets = asyncHandler(async (_req, res) => {
  const [range, categories] = await Promise.all([
    prisma.product.aggregate({ where: { isActive: true }, _min: { price: true }, _max: { price: true } }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, image: true, _count: { select: { products: true } } },
    }),
  ]);

  res.json({
    ok: true,
    data: {
      priceMin: Math.floor(range._min.price ?? 0),
      priceMax: Math.ceil(range._max.price ?? 0),
      categories: categories.map((c) => ({ ...c, productCount: c._count.products, _count: undefined })),
    },
  });
});

/** GET /api/products/:slug */
export const bySlug = asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { slug: req.params.slug, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { isActive: true }, select: variantSelect, orderBy: { sortOrder: 'asc' } },
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!product) throw ApiError.notFound('That product is no longer available');

  const relatedWhere = { isActive: true, id: { not: product.id }, ...(product.categoryId ? { categoryId: product.categoryId } : {}) };
  const related = await prisma.product.findMany({
    where: relatedWhere,
    select: productCard,
    take: 4,
    orderBy: { ratingAvg: 'desc' },
  });

  if (related.length < 4) {
    const existingIds = [product.id, ...related.map((item) => item.id)];
    const fallback = await prisma.product.findMany({
      where: { isActive: true, id: { notIn: existingIds } },
      select: productCard,
      take: 4 - related.length,
      orderBy: { ratingAvg: 'desc' },
    });
    related.push(...fallback);
  }

  const breakdown = await prisma.review.groupBy({
    by: ['rating'],
    where: { productId: product.id },
    _count: { rating: true },
  });

  res.json({
    ok: true,
    data: {
      ...withVariantSummary(product),
      reviews: product.reviews.map((r) => ({ ...r, user: undefined, author: r.user.name })),
      ratingBreakdown: [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: breakdown.find((b) => b.rating === star)?._count.rating ?? 0,
      })),
      related: related.map(withVariantSummary),
    },
  });
});

/**
 * GET /api/products/carousel — the home page hero.
 *
 * New product images are included by default; the "Show in carousel" tick on
 * each photo lets the shop owner curate the hero from the product form.
 * Each slide carries its product's own words, because the description is what
 * the hero shows over the faded edge of the image.
 */
export const carousel = asyncHandler(async (_req, res) => {
  const images = await prisma.productImage.findMany({
    where: { showInCarousel: true, product: { isActive: true } },
    orderBy: [{ product: { createdAt: 'desc' } }, { sortOrder: 'asc' }],
    take: 8,
    select: {
      id: true,
      url: true,
      alt: true,
      product: {
        select: {
          name: true,
          slug: true,
          shortDesc: true,
          description: true,
          price: true,
          mrp: true,
          variantLabel: true,
          variants: { where: { isActive: true }, select: variantSelect, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  res.json({
    ok: true,
    data: images.map(({ product, ...image }) => ({ ...image, product: withVariantSummary(product) })),
  });
});

/** GET /api/products/suggest?q= — lightweight autocomplete */
export const suggest = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ ok: true, data: [] });

  const items = await prisma.product.findMany({
    where: { isActive: true, OR: [{ name: like(q) }, { tags: like(q) }] },
    select: { name: true, slug: true, price: true, images: { select: { url: true }, take: 1, orderBy: { sortOrder: 'asc' } } },
    take: 6,
  });
  res.json({ ok: true, data: items });
});
