import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { round2, sum } from '../utils/money.js';
import { getSettings } from './settings.service.js';

/**
 * Resolves a coupon and returns the discount it grants on `subtotal`.
 * Returns { coupon: null, discount: 0 } when no code was supplied.
 */
export async function resolveCoupon(code, subtotal) {
  if (!code) return { coupon: null, discount: 0 };

  const coupon = await prisma.coupon.findUnique({ where: { code: String(code).trim().toUpperCase() } });
  const now = new Date();

  if (!coupon || !coupon.isActive) throw ApiError.badRequest('That coupon code is not valid');
  if (coupon.startsAt && coupon.startsAt > now) throw ApiError.badRequest('That coupon is not active yet');
  if (coupon.expiresAt && coupon.expiresAt < now) throw ApiError.badRequest('That coupon has expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('That coupon has reached its usage limit');
  }
  if (subtotal < coupon.minOrder) {
    throw ApiError.badRequest(`Add items worth ₹${round2(coupon.minOrder - subtotal)} more to use ${coupon.code}`);
  }

  let discount = coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = round2(Math.min(discount, subtotal));

  return { coupon, discount };
}

export function shippingFeeFor(subtotalAfterDiscount, settings) {
  if (settings.freeShippingAbove > 0 && subtotalAfterDiscount >= settings.freeShippingAbove) return 0;
  return settings.flatShippingFee;
}

/**
 * Single source of truth for order money. The client never sends prices —
 * everything is recomputed here from the database and the admin-managed
 * store settings.
 *
 * @param lines [{ product, quantity }]
 */
export async function quote({ lines, couponCode, paymentMethod = 'RAZORPAY' }) {
  const settings = await getSettings();

  // `unitPrice` is the resolved variant price; plain products fall back to their own.
  const subtotal = sum(lines, (l) => (l.unitPrice ?? l.product.price) * l.quantity);
  const { coupon, discount } = await resolveCoupon(couponCode, subtotal);

  const afterDiscount = round2(subtotal - discount);
  const shippingFee = round2(shippingFeeFor(afterDiscount, settings) + (paymentMethod === 'COD' ? settings.codExtraFee : 0));
  const tax = round2((afterDiscount * settings.taxPercent) / 100);
  const total = round2(afterDiscount + shippingFee + tax);

  return {
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    discount,
    couponCode: coupon?.code ?? null,
    shippingFee,
    tax,
    taxPercent: settings.taxPercent,
    total,
    currency: settings.currency,
    freeShippingAbove: settings.freeShippingAbove,
    amountToFreeShipping:
      settings.freeShippingAbove > 0 ? Math.max(0, round2(settings.freeShippingAbove - afterDiscount)) : 0,
  };
}

/** Throws if any line exceeds available stock or points at a disabled product. */
export function assertPurchasable(lines) {
  for (const line of lines) {
    const { product, quantity } = line;
    const label = line.label ?? product.name;
    const stock = line.stock ?? product.stock;

    if (!product.isActive) throw ApiError.badRequest(`${label} is no longer available`);
    if (quantity < 1) throw ApiError.badRequest('Quantity must be at least 1');
    if (stock < quantity) {
      throw ApiError.badRequest(stock === 0 ? `${label} is out of stock` : `Only ${stock} left of ${label}`);
    }
  }
}
