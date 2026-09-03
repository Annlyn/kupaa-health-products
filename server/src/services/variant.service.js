import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { round2 } from '../utils/money.js';

/**
 * Variants let one product be sold in several sizes — 500 g and 1 kg — each with
 * its own price, stock, SKU and shipping weight. Products that come in a single
 * size simply have no variants.
 *
 * Everything downstream (cart, checkout, shipping) works off the shape
 * returned by `resolveSellable`, so those call sites never branch on whether a
 * product has variants.
 */

export const variantSelect = {
  id: true,
  name: true,
  sku: true,
  price: true,
  mrp: true,
  stock: true,
  weightKg: true,
  lengthCm: true,
  breadthCm: true,
  heightCm: true,
  image: true,
  isActive: true,
  sortOrder: true,
};

export const activeVariants = (product) =>
  (product.variants ?? []).filter((v) => v.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);

export const hasVariants = (product) => activeVariants(product).length > 0;

/**
 * Turns (product, variantId) into the single thing being bought.
 * Throws when a choice is required but missing, or the id does not belong to
 * this product — a customer must never be able to buy a variant of something else.
 */
export function resolveSellable(product, variantId) {
  const options = activeVariants(product);

  if (!options.length) {
    if (variantId) throw ApiError.badRequest(`${product.name} does not come in multiple options`);
    return {
      variantId: null,
      variantName: null,
      sku: product.sku,
      price: product.price,
      mrp: product.mrp,
      stock: product.stock,
      weightKg: product.weightKg,
      lengthCm: product.lengthCm,
      breadthCm: product.breadthCm,
      heightCm: product.heightCm,
      image: product.images?.[0]?.url ?? null,
      label: product.name,
    };
  }

  if (!variantId) {
    throw ApiError.badRequest(`Choose a ${product.variantLabel?.toLowerCase() || 'option'} for ${product.name}`);
  }

  const variant = options.find((v) => v.id === variantId);
  if (!variant) throw ApiError.badRequest(`That option is no longer available for ${product.name}`);

  return {
    variantId: variant.id,
    variantName: variant.name,
    sku: variant.sku,
    price: variant.price,
    mrp: variant.mrp,
    stock: variant.stock,
    weightKg: variant.weightKg,
    lengthCm: variant.lengthCm,
    breadthCm: variant.breadthCm,
    heightCm: variant.heightCm,
    // The option's own photo when it has one, so a cart line and an invoice
    // show the pack that was actually bought.
    image: variant.image || product.images?.[0]?.url || null,
    label: `${product.name} — ${variant.name}`,
  };
}

/** Price range and total stock, for cards and the admin list. */
export function summarise(product) {
  const options = activeVariants(product);
  if (!options.length) {
    return { hasVariants: false, variantCount: 0, priceFrom: product.price, priceTo: product.price, stock: product.stock };
  }
  const prices = options.map((v) => v.price);
  return {
    hasVariants: true,
    variantCount: options.length,
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    stock: options.reduce((n, v) => n + v.stock, 0),
  };
}

/**
 * Recomputes the denormalised columns on Product: `price`/`mrp` mirror the
 * cheapest active variant and `stock` is the total across active variants.
 *
 * This is what lets the catalogue keep one set of queries — "in stock", price
 * sorting, price-range filters and the low-stock dashboard all read Product.
 * Call it inside the same transaction as any variant write.
 */
export async function syncProductAggregates(client, productId) {
  const db = client ?? prisma;

  const variants = await db.productVariant.findMany({ where: { productId, isActive: true } });
  if (!variants.length) return null; // no variants: the product columns are already the truth

  const cheapest = variants.reduce((min, v) => (v.price < min.price ? v : min), variants[0]);
  return db.product.update({
    where: { id: productId },
    data: {
      price: round2(cheapest.price),
      mrp: round2(Math.max(cheapest.mrp, cheapest.price)),
      stock: variants.reduce((n, v) => n + v.stock, 0),
      weightKg: cheapest.weightKg,
    },
  });
}

/** Moves stock on the variant when there is one, otherwise on the product. */
export async function adjustStock(client, { productId, variantId, delta }) {
  const db = client ?? prisma;

  if (variantId) {
    await db.productVariant.update({ where: { id: variantId }, data: { stock: { increment: delta } } });
    await syncProductAggregates(db, productId);
    return;
  }
  await db.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
}

/** Current stock for a line, read fresh inside a transaction. */
export async function readStock(client, { productId, variantId }) {
  const db = client ?? prisma;

  if (variantId) {
    const variant = await db.productVariant.findUnique({ where: { id: variantId }, select: { stock: true, isActive: true } });
    return variant?.isActive ? variant.stock : 0;
  }
  const product = await db.product.findUnique({ where: { id: productId }, select: { stock: true } });
  return product?.stock ?? 0;
}
