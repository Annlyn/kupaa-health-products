import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { newOrderNumber } from '../utils/ids.js';
import { round2 } from '../utils/money.js';
import { assertPurchasable, quote } from '../services/pricing.service.js';
import { confirmOrder, logEvent, orderInclude } from '../services/order.service.js';
import { notifyOwnerNewOrder } from '../services/notify.service.js';
import { respondWithInvoice } from '../services/invoice.service.js';
import { createRazorpayOrder, razorpayEnabled } from '../services/razorpay.service.js';
import { addressSchema } from './address.controller.js';
import { checkServiceability, trackByAwb } from '../services/amazon.service.js';
import { getSettings } from '../services/settings.service.js';
import { adjustStock, readStock, resolveSellable, variantSelect } from '../services/variant.service.js';

export const schemas = {
  create: z
    .object({
      addressId: z.string().min(1).optional(),
      address: addressSchema.partial({ isDefault: true, label: true }).optional(),
      saveAddress: z.boolean().default(false),
      paymentMethod: z.enum(['RAZORPAY', 'COD']).default('RAZORPAY'),
      couponCode: z.string().trim().max(40).optional().or(z.literal('')),
      notes: z.string().trim().max(500).optional().or(z.literal('')),
    })
    .refine((v) => v.addressId || v.address, { message: 'Choose or enter a delivery address', path: ['addressId'] }),
  listMine: z.object({
    status: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
};

async function resolveShippingAddress(req) {
  if (req.body.addressId) {
    const address = await prisma.address.findFirst({ where: { id: req.body.addressId, userId: req.user.id } });
    if (!address) throw ApiError.badRequest('That delivery address no longer exists');
    return address;
  }

  const parsed = addressSchema.parse({ label: 'Home', isDefault: false, ...req.body.address });
  if (req.body.saveAddress) {
    return prisma.address.create({ data: { ...parsed, line2: parsed.line2 || null, userId: req.user.id } });
  }
  return parsed;
}

/**
 * POST /api/orders — reserves stock and creates the order.
 *
 * RAZORPAY orders come back PENDING with a `razorpay` block for the checkout
 * widget; they only become CONFIRMED once the signature is verified.
 * COD orders are confirmed immediately.
 */
export const create = asyncHandler(async (req, res) => {
  const { paymentMethod, couponCode, notes } = req.body;
  const settings = await getSettings();

  if (paymentMethod === 'COD' && !settings.codEnabled) throw ApiError.badRequest('Cash on delivery is currently unavailable');
  if (paymentMethod === 'RAZORPAY' && !razorpayEnabled()) {
    throw ApiError.badRequest('Online payment is not configured. Please choose Cash on Delivery.');
  }

  const cartRows = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { product: { include: { variants: { where: { isActive: true }, select: variantSelect } } } },
  });
  if (!cartRows.length) throw ApiError.badRequest('Your cart is empty');

  // Resolve each row to the exact thing being bought — price, stock, SKU and
  // shipping weight all come from the chosen variant when there is one.
  const lines = cartRows.map((row) => {
    const sellable = resolveSellable(row.product, row.variantId);
    return { product: row.product, quantity: row.quantity, ...sellable, unitPrice: sellable.price };
  });
  assertPurchasable(lines);

  const address = await resolveShippingAddress(req);

  // Refuse the order early if Amazon Shipping does not serve the PIN code.
  const totalWeight = lines.reduce((w, l) => w + l.weightKg * l.quantity, 0);
  const serviceability = await checkServiceability({
    deliveryPincode: address.pincode,
    weightKg: totalWeight,
    cod: paymentMethod === 'COD',
  }).catch(() => ({ serviceable: true, services: [] })); // never block checkout on a carrier outage

  if (!serviceability.serviceable) {
    throw ApiError.badRequest(`Sorry, we cannot deliver to ${address.pincode} yet`);
  }

  const totals = await quote({ lines, couponCode: couponCode || undefined, paymentMethod });

  const order = await prisma.$transaction(async (tx) => {
    // Re-read stock inside the transaction so two concurrent checkouts cannot
    // both pass the earlier assertPurchasable check.
    for (const line of lines) {
      const fresh = await readStock(tx, { productId: line.product.id, variantId: line.variantId });
      if (fresh < line.quantity) throw ApiError.badRequest(`${line.label} just went out of stock`);
      await adjustStock(tx, { productId: line.product.id, variantId: line.variantId, delta: -line.quantity });
    }

    return tx.order.create({
      data: {
        orderNumber: newOrderNumber(),
        userId: req.user.id,
        status: 'PENDING',
        subtotal: totals.subtotal,
        discount: totals.discount,
        shippingFee: totals.shippingFee,
        tax: totals.tax,
        total: totals.total,
        couponCode: totals.couponCode,
        paymentMethod,
        paymentStatus: 'PENDING',
        shipName: address.fullName,
        shipPhone: address.phone,
        shipEmail: req.user.email,
        shipLine1: address.line1,
        shipLine2: address.line2 || null,
        shipCity: address.city,
        shipState: address.state,
        shipPincode: address.pincode,
        shipCountry: address.country || 'India',
        notes: notes || null,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            variantId: line.variantId,
            name: line.product.name,
            variantName: line.variantName,
            sku: line.sku,
            image: line.image ?? null,
            price: round2(line.unitPrice),
            quantity: line.quantity,
            weightKg: line.weightKg,
            lengthCm: line.lengthCm,
            breadthCm: line.breadthCm,
            heightCm: line.heightCm,
          })),
        },
      },
      include: { items: true },
    });
  });

  // Backfill a thumbnail for any line that had none — a variant without its own
  // photo, on a product whose images were not loaded with the cart.
  const missing = order.items.filter((item) => !item.image && item.productId);
  if (missing.length) {
    const images = await prisma.productImage.findMany({
      where: { productId: { in: missing.map((i) => i.productId) } },
      orderBy: { sortOrder: 'asc' },
    });
    for (const item of missing) {
      const img = images.find((i) => i.productId === item.productId);
      if (img) await prisma.orderItem.update({ where: { id: item.id }, data: { image: img.url } });
    }
  }

  await logEvent(order.id, 'PENDING', `Order placed (${paymentMethod === 'COD' ? 'Cash on delivery' : 'Online payment'})`);

  // The owner's WhatsApp alert must not hold up the response, and it records
  // its own outcome on the order timeline either way.
  void notifyOwnerNewOrder(order);

  if (paymentMethod === 'COD') {
    const confirmed = await confirmOrder(order.id, { message: 'COD order confirmed' });
    return res.status(201).json({ ok: true, data: { order: confirmed, payment: null } });
  }

  const rzpOrder = await createRazorpayOrder({
    amount: order.total,
    receipt: order.orderNumber,
    notes: { orderId: order.id, orderNumber: order.orderNumber, email: req.user.email },
  });

  await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzpOrder.id } });

  res.status(201).json({
    ok: true,
    data: {
      order: await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }),
      payment: {
        provider: 'razorpay',
        keyId: env.razorpay.keyId,
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: settings.storeName,
        description: `Order ${order.orderNumber}`,
        prefill: { name: req.user.name, email: req.user.email, contact: address.phone },
      },
    },
  });
});

export const listMine = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  const where = { userId: req.user.id, ...(status ? { status } : {}) };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true, shipment: true },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ ok: true, data: orders, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { userId: req.user.id, OR: [{ id: req.params.id }, { orderNumber: req.params.id }] },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ ok: true, data: order });
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    throw ApiError.badRequest('This order can no longer be cancelled. Please contact support.');
  }

  const { cancelOrder } = await import('../services/order.service.js');
  const cancelled = await cancelOrder(order.id, { reason: req.body?.reason || 'Cancelled by customer', source: 'ADMIN' });
  res.json({ ok: true, data: cancelled });
});

/** GET /api/orders/:id/track — live courier scan history. */
export const track = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { userId: req.user.id, OR: [{ id: req.params.id }, { orderNumber: req.params.id }] },
    include: { shipment: true, events: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) throw ApiError.notFound('Order not found');

  let courier = null;
  if (order.shipment?.awbCode) {
    courier = await trackByAwb(order.shipment.awbCode).catch(() => null);
  }

  res.json({
    ok: true,
    data: {
      orderNumber: order.orderNumber,
      status: order.status,
      awb: order.shipment?.awbCode ?? null,
      courierName: order.shipment?.courierName ?? null,
      trackingUrl: order.shipment?.trackingUrl ?? courier?.trackUrl ?? null,
      etd: order.shipment?.etd ?? courier?.edd ?? null,
      events: order.events,
      courier,
    },
  });
});

/** GET /api/orders/:id/invoice — the customer's own invoice, as a PDF. */
export const invoice = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: req.params.id }, { orderNumber: req.params.id }], userId: req.user.id },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Order not found');
  await respondWithInvoice(res, order);
});
