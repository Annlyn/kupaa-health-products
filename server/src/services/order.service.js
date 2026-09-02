import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { isMock } from './amazon.service.js';
import { adjustStock } from './variant.service.js';

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

/** Statuses an order may legally move to from its current one. */
export const ALLOWED_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export const orderInclude = {
  items: true,
  shipment: true,
  events: { orderBy: { createdAt: 'desc' } },
  user: { select: { id: true, name: true, email: true, phone: true } },
};

export function logEvent(orderId, status, message, source = 'SYSTEM') {
  return prisma.orderEvent.create({ data: { orderId, status, message, source } });
}

/**
 * Everything that must happen once an order is paid (or placed as COD):
 * clear the cart, count the coupon, move to CONFIRMED and open a shipment.
 * Carrier failures are logged, never fatal — the admin can retry by hand.
 */
export async function confirmOrder(orderId, { source = 'SYSTEM', message } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  if (order.status !== 'PENDING') return order; // already handled (e.g. webhook raced the callback)

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    if (order.userId) await tx.cartItem.deleteMany({ where: { userId: order.userId } });
    if (order.couponCode) {
      await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { usedCount: { increment: 1 } } });
    }
  });

  await logEvent(order.id, 'CONFIRMED', message || 'Order confirmed', source);
  await pushToCarrier(order).catch((err) => logger.error('[order] shipment prepare failed', err.message));

  return prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });
}

/**
 * Opens the shipment record for an order (safe to call twice).
 *
 * Amazon Shipping has no "create order" step — nothing exists on their side
 * until a label is bought, which happens when the admin ships the order. So
 * this only reserves our own row, and `POST /admin/orders/:id/ship` fills in
 * the Amazon shipment id, tracking id and label.
 */
export async function pushToCarrier(order) {
  const existing = await prisma.shipment.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;

  const shipment = await prisma.shipment.create({ data: { orderId: order.id, status: 'CREATED' } });

  await logEvent(
    order.id,
    'CONFIRMED',
    `Ready to ship with Amazon Shipping${isMock() ? ' (mock mode)' : ''}`,
    'AMAZON',
  );
  return shipment;
}

/** Puts reserved stock back. Called on cancellation and failed payments. */
export async function restockOrder(tx, orderId) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (!item.productId) continue;
    await adjustStock(tx, { productId: item.productId, variantId: item.variantId, delta: item.quantity });
  }
}

export async function cancelOrder(orderId, { reason, source = 'SYSTEM' } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  await prisma.$transaction(async (tx) => {
    await restockOrder(tx, order.id);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  });

  await logEvent(order.id, 'CANCELLED', reason || 'Order cancelled', source);
  return prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });
}

/**
 * Carrier status -> our order statuses. Amazon reports CamelCase event codes
 * ("OutForDelivery", "PickupDone"); the spaces are stripped so both those and
 * the human-readable summary strings match.
 */
export function mapCarrierStatus(status = '') {
  const s = String(status).toUpperCase().replace(/[\s_-]/g, '');
  if (s.includes('DELIVERED')) return 'DELIVERED';
  if (['RETURN', 'RTO', 'UNDELIVERABLE', 'LOST'].some((k) => s.includes(k))) return 'RETURNED';
  if (s.includes('CANCEL')) return 'CANCELLED';
  if (['OUTFORDELIVERY', 'INTRANSIT', 'DEPARTED', 'ARRIVED', 'SHIPPED', 'PICKUPDONE', 'PICKEDUP'].some((k) => s.includes(k)))
    return 'SHIPPED';
  if (['CREATIONCONFIRMED', 'READYFORPICKUP', 'READYFORRECEIVE', 'LABEL', 'MANIFEST', 'PACKED'].some((k) => s.includes(k)))
    return 'PACKED';
  return null;
}
