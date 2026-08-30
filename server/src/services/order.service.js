import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createShiprocketOrder, isMock } from './shiprocket.service.js';
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
 * clear the cart, count the coupon, move to CONFIRMED and push to Shiprocket.
 * Shiprocket failures are logged, never fatal — the admin can retry by hand.
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
  await pushToShiprocket(order).catch((err) => logger.error('[order] shiprocket push failed', err.message));

  return prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });
}

/** Creates the Shiprocket order record for an order (safe to call twice). */
export async function pushToShiprocket(order) {
  const existing = await prisma.shipment.findUnique({ where: { orderId: order.id } });
  if (existing?.shiprocketOrderId) return existing;

  const full = order.items ? order : await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
  const created = await createShiprocketOrder(full);

  const shipment = await prisma.shipment.upsert({
    where: { orderId: full.id },
    create: {
      orderId: full.id,
      shiprocketOrderId: created.shiprocketOrderId,
      shiprocketShipmentId: created.shiprocketShipmentId,
      status: 'CREATED',
    },
    update: {
      shiprocketOrderId: created.shiprocketOrderId,
      shiprocketShipmentId: created.shiprocketShipmentId,
      status: 'CREATED',
    },
  });

  await logEvent(
    full.id,
    'CONFIRMED',
    `Shipment created in Shiprocket${isMock() ? ' (mock mode)' : ''} — ref ${created.shiprocketOrderId}`,
    'SHIPROCKET',
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

/** Shiprocket status strings -> our order statuses. */
export function mapShiprocketStatus(status = '') {
  const s = String(status).toUpperCase();
  if (['DELIVERED'].some((k) => s.includes(k))) return 'DELIVERED';
  if (['RTO', 'RETURN'].some((k) => s.includes(k))) return 'RETURNED';
  if (['CANCEL'].some((k) => s.includes(k))) return 'CANCELLED';
  if (['OUT FOR DELIVERY', 'IN TRANSIT', 'SHIPPED', 'PICKED UP'].some((k) => s.includes(k))) return 'SHIPPED';
  if (['PICKUP', 'MANIFEST', 'AWB', 'READY'].some((k) => s.includes(k))) return 'PACKED';
  return null;
}
