import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { productCard, withVariantSummary } from './product.controller.js';

export const list = asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, slug: true, description: true, image: true,
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });
  res.json({ ok: true, data: categories.map((c) => ({ ...c, productCount: c._count.products, _count: undefined })) });
});

export const bySlug = asyncHandler(async (req, res) => {
  const category = await prisma.category.findFirst({ where: { slug: req.params.slug, isActive: true } });
  if (!category) throw ApiError.notFound('Category not found');

  const products = await prisma.product.findMany({
    where: { categoryId: category.id, isActive: true },
    select: productCard,
    orderBy: { createdAt: 'desc' },
    take: 24,
  });
  res.json({ ok: true, data: { category, products: products.map(withVariantSummary) } });
});
