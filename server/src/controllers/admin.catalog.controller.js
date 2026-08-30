import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uniqueSlug } from '../utils/slug.js';
import { round2 } from '../utils/money.js';
import { syncProductAggregates, variantSelect } from '../services/variant.service.js';
import { uploadDir } from '../middleware/upload.js';

const imageInput = z.object({ url: z.string().min(1), alt: z.string().max(160).optional().or(z.literal('')) });

const variantInput = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'Give the option a name, e.g. 500 g').max(60),
  sku: z.string().trim().min(1, 'Each option needs its own SKU').max(60),
  price: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0).default(0),
  weightKg: z.coerce.number().min(0.01, 'Weight is required for shipping').max(50).default(0.3),
  isActive: z.boolean().default(true),
});

export const schemas = {
  product: z.object({
    name: z.string().trim().min(2, 'Product name is required').max(140),
    slug: z.string().trim().max(90).optional().or(z.literal('')),
    sku: z.string().trim().min(1, 'SKU is required').max(60),
    shortDesc: z.string().trim().max(300).optional().or(z.literal('')),
    description: z.string().trim().max(8000).optional().or(z.literal('')),
    categoryId: z.string().optional().or(z.literal('')).nullable(),
    price: z.coerce.number().min(0, 'Price cannot be negative'),
    mrp: z.coerce.number().min(0),
    stock: z.coerce.number().int().min(0).default(0),
    lowStockAt: z.coerce.number().int().min(0).default(5),
    weightKg: z.coerce.number().min(0.01, 'Weight is required for shipping').max(50).default(0.3),
    lengthCm: z.coerce.number().min(1).max(200).default(15),
    breadthCm: z.coerce.number().min(1).max(200).default(10),
    heightCm: z.coerce.number().min(1).max(200).default(5),
    hsn: z.string().trim().max(20).optional().or(z.literal('')),
    tags: z.string().trim().max(300).optional().or(z.literal('')),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    images: z.array(imageInput).max(8).default([]),

    variantLabel: z.string().trim().max(30).optional().or(z.literal('')).nullable(),
    variants: z.array(variantInput).max(20).default([]),
  })
    .refine((v) => v.variants.length > 0 || v.mrp >= v.price, {
      message: 'MRP must be at least the selling price',
      path: ['mrp'],
    })
    .refine((v) => v.variants.every((x) => x.mrp >= x.price), {
      message: 'Each option needs an MRP at least equal to its price',
      path: ['variants'],
    })
    .refine((v) => new Set(v.variants.map((x) => x.sku.trim().toLowerCase())).size === v.variants.length, {
      message: 'Two options share the same SKU',
      path: ['variants'],
    })
    .refine((v) => new Set(v.variants.map((x) => x.name.trim().toLowerCase())).size === v.variants.length, {
      message: 'Two options share the same name',
      path: ['variants'],
    })
    .refine((v) => v.variants.length === 0 || Boolean(v.variantLabel?.trim()), {
      message: 'Name the option type, e.g. Weight or Size',
      path: ['variantLabel'],
    }),

  productList: z.object({
    q: z.string().trim().optional(),
    category: z.string().optional(),
    status: z.enum(['all', 'active', 'inactive', 'low', 'out']).default('all'),
    sort: z.enum(['newest', 'name', 'price_asc', 'price_desc', 'stock']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  bulk: z.object({
    ids: z.array(z.string().min(1)).min(1, 'Select at least one product').max(200),
    action: z.enum(['activate', 'deactivate', 'feature', 'unfeature', 'delete', 'discount', 'clearDiscount', 'setStock']),
    value: z.coerce.number().optional(),
    // Delete products that appear in orders outright instead of archiving them.
    force: z.boolean().default(false),
  }),

  category: z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().max(90).optional().or(z.literal('')),
    description: z.string().trim().max(600).optional().or(z.literal('')),
    image: z.string().trim().max(400).optional().or(z.literal('')),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).default(0),
  }),
};

const clean = (v) => (v === '' ? null : v);

// ------------------------------------------------------------------ products

export const listProducts = asyncHandler(async (req, res) => {
  const { q, category, status, sort, page, limit } = req.query;

  const where = {};
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }, { tags: { contains: q } }];
  if (category) where.categoryId = category;
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (status === 'out') where.stock = { lte: 0 };
  if (status === 'low') where.stock = { gt: 0, lte: 5 };

  const orderBy = {
    newest: { createdAt: 'desc' },
    name: { name: 'asc' },
    price_asc: { price: 'asc' },
    price_desc: { price: 'desc' },
    stock: { stock: 'asc' },
  }[sort];

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: { where: { isActive: true }, select: variantSelect, orderBy: { sortOrder: 'asc' } },
        _count: { select: { orderItems: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ ok: true, data: items, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

/** Admin view of a product: images and every variant, active or not. */
const findAdminProduct = (id) =>
  prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      category: true,
      variants: { orderBy: { sortOrder: 'asc' } },
    },
  });

export const getProduct = asyncHandler(async (req, res) => {
  const product = await findAdminProduct(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  res.json({ ok: true, data: product });
});

export const createProduct = asyncHandler(async (req, res) => {
  const { images, variants, slug, ...body } = req.body;
  const finalSlug = await uniqueSlug(slug || body.name, async (s) => Boolean(await prisma.product.findUnique({ where: { slug: s } })));

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...body,
        slug: finalSlug,
        shortDesc: clean(body.shortDesc),
        description: clean(body.description),
        categoryId: clean(body.categoryId),
        hsn: clean(body.hsn),
        tags: clean(body.tags),
        variantLabel: variants.length ? clean(body.variantLabel) : null,
        images: { create: images.map((img, i) => ({ url: img.url, alt: clean(img.alt), sortOrder: i })) },
        variants: {
          create: variants.map((v, i) => ({
            name: v.name,
            sku: v.sku,
            price: v.price,
            mrp: v.mrp,
            stock: v.stock,
            weightKg: v.weightKg,
            isActive: v.isActive,
            sortOrder: i,
          })),
        },
      },
    });
    await syncProductAggregates(tx, created.id);
    return created;
  });

  res.status(201).json({ ok: true, data: await findAdminProduct(product.id) });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const existing = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { images: true, variants: true },
  });
  if (!existing) throw ApiError.notFound('Product not found');

  const { images, variants, slug, ...body } = req.body;
  const finalSlug =
    slug && slug !== existing.slug
      ? await uniqueSlug(slug, async (s) => s !== existing.slug && Boolean(await prisma.product.findUnique({ where: { slug: s } })))
      : existing.slug;

  await prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: existing.id } });

    // Variants referenced by a cart or an order are deactivated rather than
    // deleted, so history and live carts survive an edit.
    const keptIds = variants.map((v) => v.id).filter(Boolean);
    const dropped = existing.variants.filter((v) => !keptIds.includes(v.id));

    for (const variant of dropped) {
      const inUse = await tx.orderItem.count({ where: { variantId: variant.id } });
      if (inUse > 0) await tx.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });
      else await tx.productVariant.delete({ where: { id: variant.id } });
    }

    for (const [i, v] of variants.entries()) {
      const data = {
        name: v.name,
        sku: v.sku,
        price: v.price,
        mrp: v.mrp,
        stock: v.stock,
        weightKg: v.weightKg,
        isActive: v.isActive,
        sortOrder: i,
      };
      if (v.id && existing.variants.some((x) => x.id === v.id)) {
        await tx.productVariant.update({ where: { id: v.id }, data });
      } else {
        await tx.productVariant.create({ data: { ...data, productId: existing.id } });
      }
    }

    await tx.product.update({
      where: { id: existing.id },
      data: {
        ...body,
        slug: finalSlug,
        shortDesc: clean(body.shortDesc),
        description: clean(body.description),
        categoryId: clean(body.categoryId),
        hsn: clean(body.hsn),
        tags: clean(body.tags),
        variantLabel: variants.length ? clean(body.variantLabel) : null,
        images: { create: images.map((img, i) => ({ url: img.url, alt: clean(img.alt), sortOrder: i })) },
      },
    });

    await syncProductAggregates(tx, existing.id);
  });

  const product = await findAdminProduct(existing.id);

  // Remove upload files that no image row references any more.
  await pruneOrphanUploads(existing.images.map((i) => i.url), images.map((i) => i.url));

  res.json({ ok: true, data: product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const force = req.query.force === 'true' || req.body?.force === true;

  const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { _count: { select: { orderItems: true } } } });
  if (!product) throw ApiError.notFound('Product not found');

  // A product in someone's order history is archived by default — that keeps the
  // order linked to a live product page. `force` removes it outright, which is
  // safe because OrderItem stores its own name, SKU, price and image, and the
  // foreign key is SetNull. Past invoices still render; they just stop linking.
  if (product._count.orderItems > 0 && !force) {
    const archived = await prisma.product.update({ where: { id: product.id }, data: { isActive: false, isFeatured: false } });
    return res.json({
      ok: true,
      data: {
        archived: true,
        product: archived,
        orderCount: product._count.orderItems,
        message: `Archived — it appears in ${product._count.orderItems} order(s). Delete permanently to remove it for good.`,
      },
    });
  }

  await prisma.product.delete({ where: { id: product.id } });
  res.json({
    ok: true,
    data: {
      archived: false,
      message: product._count.orderItems > 0
        ? `Deleted permanently. ${product._count.orderItems} past order(s) keep their record of it.`
        : 'Product deleted',
    },
  });
});

/** PATCH /api/admin/products/:id/stock — quick inline stock edit. */
export const adjustStock = asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta);
  const set = req.body.stock;

  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { variants: { where: { isActive: true }, select: { id: true } } },
  });
  if (!product) throw ApiError.notFound('Product not found');
  if (product.variants.length) {
    throw ApiError.badRequest('This product stocks each option separately — edit the options on the product page');
  }

  const stock = set != null ? Math.max(0, Math.trunc(Number(set))) : Math.max(0, product.stock + (Number.isFinite(delta) ? delta : 0));
  const updated = await prisma.product.update({ where: { id: product.id }, data: { stock } });
  res.json({ ok: true, data: updated });
});

/**
 * POST /api/admin/products/bulk — one action across a selection.
 *
 * `discount` takes a percentage and rewrites the selling price from each
 * product's own MRP, so a 20% sale is one click rather than N edits.
 * `delete` follows the same rule as single deletes: archive anything that
 * appears in an order, remove the rest.
 */
export const bulkUpdate = asyncHandler(async (req, res) => {
  const { ids, action, value } = req.body;

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!products.length) throw ApiError.notFound('None of those products exist');

  const summary = { updated: 0, archived: 0, deleted: 0 };

  switch (action) {
    case 'activate':
    case 'deactivate': {
      const isActive = action === 'activate';
      const result = await prisma.product.updateMany({
        where: { id: { in: ids } },
        data: isActive ? { isActive } : { isActive, isFeatured: false },
      });
      summary.updated = result.count;
      break;
    }

    case 'feature':
    case 'unfeature': {
      const isFeatured = action === 'feature';
      // A hidden product must never surface in Bestsellers.
      const target = isFeatured ? products.filter((p) => p.isActive).map((p) => p.id) : ids;
      if (isFeatured && !target.length) throw ApiError.badRequest('Activate these products before featuring them');
      const result = await prisma.product.updateMany({ where: { id: { in: target } }, data: { isFeatured } });
      summary.updated = result.count;
      break;
    }

    case 'discount':
    case 'clearDiscount': {
      if (action === 'discount' && (!(value > 0) || value >= 100)) {
        throw ApiError.badRequest('Enter a discount between 1 and 99 percent');
      }
      const priceFrom = (mrp) => (action === 'discount' ? Math.max(1, round2((mrp * (100 - value)) / 100)) : round2(mrp));

      await prisma.$transaction(async (tx) => {
        for (const product of products) {
          const variants = await tx.productVariant.findMany({ where: { productId: product.id } });

          // Each option is repriced from its own MRP, so a 1 kg pack keeps
          // costing more than a 500 g one.
          for (const variant of variants) {
            await tx.productVariant.update({ where: { id: variant.id }, data: { price: priceFrom(variant.mrp) } });
          }

          if (variants.length) await syncProductAggregates(tx, product.id);
          else await tx.product.update({ where: { id: product.id }, data: { price: priceFrom(product.mrp) } });
        }
      });
      summary.updated = products.length;
      break;
    }

    case 'setStock': {
      const stock = Math.max(0, Math.trunc(Number(value)));
      if (!Number.isFinite(stock)) throw ApiError.badRequest('Enter a stock quantity');
      const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { stock } });
      summary.updated = result.count;
      break;
    }

    case 'delete': {
      const sold = req.body.force ? [] : products.filter((p) => p._count.orderItems > 0).map((p) => p.id);
      const unsold = req.body.force
        ? products.map((p) => p.id)
        : products.filter((p) => p._count.orderItems === 0).map((p) => p.id);

      if (sold.length) {
        const archived = await prisma.product.updateMany({
          where: { id: { in: sold } },
          data: { isActive: false, isFeatured: false },
        });
        summary.archived = archived.count;
      }
      if (unsold.length) {
        const removed = await prisma.product.deleteMany({ where: { id: { in: unsold } } });
        summary.deleted = removed.count;
      }
      break;
    }

    default:
      throw ApiError.badRequest('Unknown bulk action');
  }

  res.json({ ok: true, data: summary });
});

/** POST /api/admin/products/:id/duplicate — a draft copy to edit. */
export const duplicateProduct = asyncHandler(async (req, res) => {
  const source = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!source) throw ApiError.notFound('Product not found');

  const { id, createdAt, updatedAt, images, variants, ratingAvg, ratingCount, slug, sku, name, ...rest } = source;

  const copy = await prisma.product.create({
    data: {
      ...rest,
      name: `${name} (copy)`,
      slug: await uniqueSlug(`${name}-copy`, async (s) => Boolean(await prisma.product.findUnique({ where: { slug: s } }))),
      sku: await uniqueSku(`${sku}-COPY`),
      // Copies start hidden so a half-finished duplicate never reaches shoppers.
      isActive: false,
      isFeatured: false,
      ratingAvg: 0,
      ratingCount: 0,
      images: { create: images.map((img, i) => ({ url: img.url, alt: img.alt, sortOrder: i })) },
    },
  });

  // SKUs are unique, so each copied option needs its own.
  for (const [i, v] of variants.entries()) {
    await prisma.productVariant.create({
      data: {
        productId: copy.id,
        name: v.name,
        sku: await uniqueSku(`${v.sku}-COPY`),
        price: v.price,
        mrp: v.mrp,
        stock: v.stock,
        weightKg: v.weightKg,
        isActive: v.isActive,
        sortOrder: i,
      },
    });
  }
  await syncProductAggregates(null, copy.id);

  res.status(201).json({ ok: true, data: await findAdminProduct(copy.id) });
});

async function uniqueSku(base) {
  let candidate = base.slice(0, 55);
  let n = 1;
  while (await prisma.product.findUnique({ where: { sku: candidate } })) {
    n += 1;
    candidate = `${base.slice(0, 52)}-${n}`;
  }
  return candidate;
}

async function pruneOrphanUploads(oldUrls, newUrls) {
  const keep = new Set(newUrls);
  const removed = oldUrls.filter((u) => !keep.has(u) && u.startsWith('/uploads/'));
  await Promise.all(
    removed.map(async (url) => {
      const file = path.join(uploadDir, path.basename(url));
      const stillUsed = await prisma.productImage.count({ where: { url } });
      if (stillUsed === 0) await fs.unlink(file).catch(() => {});
    }),
  );
}

// ---------------------------------------------------------------- categories

export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({ ok: true, data: categories.map((c) => ({ ...c, productCount: c._count.products, _count: undefined })) });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { slug, ...body } = req.body;
  const finalSlug = await uniqueSlug(slug || body.name, async (s) => Boolean(await prisma.category.findUnique({ where: { slug: s } })));

  const category = await prisma.category.create({
    data: { ...body, slug: finalSlug, description: clean(body.description), image: clean(body.image) },
  });
  res.status(201).json({ ok: true, data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Category not found');

  const { slug, ...body } = req.body;
  const finalSlug =
    slug && slug !== existing.slug
      ? await uniqueSlug(slug, async (s) => s !== existing.slug && Boolean(await prisma.category.findUnique({ where: { slug: s } })))
      : existing.slug;

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { ...body, slug: finalSlug, description: clean(body.description), image: clean(body.image) },
  });
  res.json({ ok: true, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const count = await prisma.product.count({ where: { categoryId: req.params.id } });
  if (count > 0) throw ApiError.badRequest(`Move the ${count} product(s) in this category first`);

  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true, data: { message: 'Category deleted' } });
});
