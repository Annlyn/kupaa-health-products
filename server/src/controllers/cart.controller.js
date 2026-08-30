import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { quote } from '../services/pricing.service.js';
import { getSettings } from '../services/settings.service.js';
import { resolveSellable, variantSelect } from '../services/variant.service.js';

export const schemas = {
  add: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).optional().nullable(),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
  }),
  update: z.object({ quantity: z.coerce.number().int().min(0).max(50) }),
  guestQuote: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          variantId: z.string().min(1).optional().nullable(),
          quantity: z.coerce.number().int().min(1).max(50),
        }),
      )
      .max(50)
      .default([]),
    couponCode: z.string().trim().max(40).optional(),
    paymentMethod: z.enum(['RAZORPAY', 'COD']).default('RAZORPAY'),
  }),
  merge: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          variantId: z.string().min(1).optional().nullable(),
          quantity: z.coerce.number().int().min(1).max(50),
        }),
      )
      .max(50),
  }),
};

const lineSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  price: true,
  mrp: true,
  stock: true,
  weightKg: true,
  isActive: true,
  variantLabel: true,
  images: { select: { url: true }, take: 1, orderBy: { sortOrder: 'asc' } },
  variants: { where: { isActive: true }, select: variantSelect, orderBy: { sortOrder: 'asc' } },
};

/**
 * Builds a priced cart line. Price, stock and weight come from the chosen
 * variant when there is one, so nothing downstream has to know the difference.
 */
function toLine(row) {
  const sellable = resolveSellable(row.product, row.variantId ?? null);
  return {
    id: row.id,
    productId: row.productId,
    variantId: sellable.variantId,
    variantName: sellable.variantName,
    variantLabel: row.product.variantLabel,
    quantity: row.quantity,
    product: row.product,
    unitPrice: sellable.price,
    mrp: sellable.mrp,
    sku: sellable.sku,
    weightKg: sellable.weightKg,
    lineTotal: Math.round(sellable.price * row.quantity * 100) / 100,
    inStock: sellable.stock >= row.quantity,
    maxQuantity: sellable.stock,
  };
}

/** Loads cart rows for a user and prices them. */
export async function loadCart(userId, { couponCode, paymentMethod } = {}) {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { product: { select: lineSelect } },
  });

  const lines = [];
  for (const row of rows) {
    if (!row.product.isActive) continue;
    try {
      lines.push(toLine(row));
    } catch {
      // The variant was removed after it was added — drop the row rather than
      // breaking the whole cart page.
      await prisma.cartItem.delete({ where: { id: row.id } }).catch(() => {});
    }
  }

  let totals;
  let couponError = null;
  try {
    totals = await quote({ lines, couponCode, paymentMethod });
  } catch (err) {
    // A coupon that stopped being valid should not break the cart page.
    couponError = err.message;
    totals = await quote({ lines, paymentMethod });
  }

  return { items: lines, totals, couponError };
}

export const get = asyncHandler(async (req, res) => {
  const { couponCode, paymentMethod } = req.query;
  res.json({ ok: true, data: await loadCart(req.user.id, { couponCode, paymentMethod }) });
});

export const add = asyncHandler(async (req, res) => {
  const { productId, variantId = null, quantity } = req.body;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { where: { isActive: true }, select: variantSelect } },
  });
  if (!product || !product.isActive) throw ApiError.notFound('That product is not available');

  const sellable = resolveSellable(product, variantId);
  const { maxQtyPerItem } = await getSettings();

  // variantId is nullable, so a unique index cannot dedupe here — look first.
  const existing = await prisma.cartItem.findFirst({
    where: { userId: req.user.id, productId, variantId: sellable.variantId },
  });

  const nextQty = Math.min((existing?.quantity ?? 0) + quantity, maxQtyPerItem);
  if (sellable.stock < nextQty) {
    throw ApiError.badRequest(
      sellable.stock === 0 ? `${sellable.label} is out of stock` : `Only ${sellable.stock} of ${sellable.label} in stock`,
    );
  }

  if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
  else await prisma.cartItem.create({ data: { userId: req.user.id, productId, variantId: sellable.variantId, quantity: nextQty } });

  res.status(201).json({ ok: true, data: await loadCart(req.user.id) });
});

export const update = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const item = await prisma.cartItem.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { product: { include: { variants: { where: { isActive: true }, select: variantSelect } } } },
  });
  if (!item) throw ApiError.notFound('That item is not in your cart');

  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    const sellable = resolveSellable(item.product, item.variantId);
    const { maxQtyPerItem } = await getSettings();
    if (quantity > maxQtyPerItem) throw ApiError.badRequest(`You can order at most ${maxQtyPerItem} of one item`);
    if (sellable.stock < quantity) throw ApiError.badRequest(`Only ${sellable.stock} of ${sellable.label} in stock`);
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }

  res.json({ ok: true, data: await loadCart(req.user.id) });
});

export const remove = asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ ok: true, data: await loadCart(req.user.id) });
});

export const clear = asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
  res.json({ ok: true, data: await loadCart(req.user.id) });
});

/** Folds a guest (localStorage) cart into the signed-in cart after login. */
export const merge = asyncHandler(async (req, res) => {
  const { maxQtyPerItem } = await getSettings();

  for (const { productId, variantId = null, quantity } of req.body.items) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { where: { isActive: true }, select: variantSelect } },
    });
    if (!product?.isActive) continue;

    let sellable;
    try {
      sellable = resolveSellable(product, variantId);
    } catch {
      continue; // stale guest row — skip it rather than failing the merge
    }
    if (sellable.stock < 1) continue;

    const existing = await prisma.cartItem.findFirst({
      where: { userId: req.user.id, productId, variantId: sellable.variantId },
    });
    const merged = Math.min(Math.max(existing?.quantity ?? 0, quantity), sellable.stock, maxQtyPerItem);

    if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
    else await prisma.cartItem.create({ data: { userId: req.user.id, productId, variantId: sellable.variantId, quantity: merged } });
  }
  res.json({ ok: true, data: await loadCart(req.user.id) });
});

/** Public pricing for a guest cart — the client never computes totals itself. */
export const guestQuote = asyncHandler(async (req, res) => {
  const { items, couponCode, paymentMethod } = req.body;
  if (!items.length) {
    return res.json({ ok: true, data: { items: [], totals: await quote({ lines: [], paymentMethod }), couponError: null } });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, isActive: true },
    select: lineSelect,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = [];
  for (const i of items) {
    const product = byId.get(i.productId);
    if (!product) continue;
    try {
      // A guest line keys on product+variant so the same product in two sizes
      // stays two rows.
      lines.push(toLine({ id: `${i.productId}:${i.variantId ?? ''}`, productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, product }));
    } catch {
      // unknown or withdrawn variant — silently drop it from the quote
    }
  }

  let totals;
  let couponError = null;
  try {
    totals = await quote({ lines, couponCode, paymentMethod });
  } catch (err) {
    couponError = err.message;
    totals = await quote({ lines, paymentMethod });
  }

  res.json({ ok: true, data: { items: lines, totals, couponError } });
});
