import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { round2 } from '../utils/money.js';
import { ALLOWED_TRANSITIONS, cancelOrder, logEvent, orderInclude, pushToShiprocket } from '../services/order.service.js';
import { refundPayment } from '../services/razorpay.service.js';
import { like } from '../lib/search.js';
import {
  assignAwb,
  cancelShipment,
  checkServiceability,
  generateInvoice,
  generateLabel,
  generateManifest,
  requestPickup,
  trackByAwb,
} from '../services/shiprocket.service.js';

export const schemas = {
  list: z.object({
    q: z.string().trim().optional(),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  setStatus: z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
    note: z.string().trim().max(300).optional().or(z.literal('')),
  }),
  ship: z.object({ courierCompanyId: z.coerce.number().int().optional(), schedulePickup: z.boolean().default(true) }),
  refund: z.object({ amount: z.coerce.number().min(1).optional(), reason: z.string().trim().max(300).optional() }),
};

export const list = asyncHandler(async (req, res) => {
  const { q, status, paymentStatus, from, to, page, limit } = req.query;

  const where = {};
  if (status && status !== 'all') where.status = status;
  if (paymentStatus && paymentStatus !== 'all') where.paymentStatus = paymentStatus;
  if (from || to) {
    where.placedAt = {};
    if (from) where.placedAt.gte = new Date(from);
    if (to) where.placedAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (q) {
    where.OR = [
      { orderNumber: like(q) },
      { shipName: like(q) },
      { shipEmail: like(q) },
      { shipPhone: like(q) },
      { shipment: { awbCode: like(q) } },
    ];
  }

  const [orders, total, revenue] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true, shipment: true, user: { select: { name: true, email: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { total: true } }),
  ]);

  res.json({
    ok: true,
    data: orders,
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), revenue: round2(revenue._sum.total ?? 0) },
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: req.params.id }, { orderNumber: req.params.id }] },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ ok: true, data: order });
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === status) return res.json({ ok: true, data: order });

  if (!ALLOWED_TRANSITIONS[order.status]?.includes(status)) {
    throw ApiError.badRequest(`Cannot move an order from ${order.status} to ${status}`);
  }

  if (status === 'CANCELLED') {
    const cancelled = await cancelOrder(order.id, { reason: note || 'Cancelled by admin', source: 'ADMIN' });
    return res.json({ ok: true, data: cancelled });
  }

  await prisma.order.update({ where: { id: order.id }, data: { status } });
  await logEvent(order.id, status, note || `Marked ${status.toLowerCase()} by admin`, 'ADMIN');

  res.json({ ok: true, data: await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }) });
});

/** GET /api/admin/orders/:id/couriers — rate card for this order's destination. */
export const couriers = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!order) throw ApiError.notFound('Order not found');

  const weightKg = order.items.reduce((w, i) => w + (i.weightKg || 0.3) * i.quantity, 0);
  const result = await checkServiceability({
    deliveryPincode: order.shipPincode,
    weightKg,
    cod: order.paymentMethod === 'COD',
    declaredValue: order.total,
  });
  res.json({ ok: true, data: { ...result, weightKg: round2(weightKg) } });
});

/**
 * POST /api/admin/orders/:id/ship — the one-click fulfilment action:
 * create the Shiprocket order if needed, assign an AWB, schedule pickup and
 * pull the label, then move the order to SHIPPED.
 */
export const ship = asyncHandler(async (req, res) => {
  const { courierCompanyId, schedulePickup } = req.body;

  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true, shipment: true } });
  if (!order) throw ApiError.notFound('Order not found');
  if (['CANCELLED', 'RETURNED'].includes(order.status)) throw ApiError.badRequest('This order cannot be shipped');
  if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID') {
    throw ApiError.badRequest('Payment has not been received for this order yet');
  }

  let shipment = order.shipment?.shiprocketShipmentId ? order.shipment : await pushToShiprocket(order);

  if (!shipment.awbCode) {
    const awb = await assignAwb({ shipmentId: shipment.shiprocketShipmentId, courierCompanyId });
    shipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        awbCode: awb.awbCode,
        courierName: awb.courierName,
        courierCompanyId: awb.courierCompanyId,
        freightCharge: awb.freightCharge,
        status: 'AWB_ASSIGNED',
        trackingUrl: `https://shiprocket.co/tracking/${awb.awbCode}`,
      },
    });
    await logEvent(order.id, order.status, `AWB ${awb.awbCode} assigned (${awb.courierName})`, 'SHIPROCKET');
  }

  if (schedulePickup && !shipment.pickupScheduledAt) {
    const pickup = await requestPickup(shipment.shiprocketShipmentId).catch(() => null);
    if (pickup?.scheduled) {
      shipment = await prisma.shipment.update({
        where: { id: shipment.id },
        data: { pickupScheduledAt: new Date(), status: 'PICKUP_SCHEDULED' },
      });
      await logEvent(order.id, order.status, 'Pickup requested from courier', 'SHIPROCKET');
    }
  }

  const label = await generateLabel(shipment.shiprocketShipmentId).catch(() => null);
  if (label?.labelUrl) {
    shipment = await prisma.shipment.update({ where: { id: shipment.id }, data: { labelUrl: label.labelUrl } });
  }

  if (['PENDING', 'CONFIRMED', 'PACKED'].includes(order.status)) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });
    await logEvent(order.id, 'SHIPPED', `Handed to ${shipment.courierName || 'courier'}`, 'SHIPROCKET');
  }

  res.json({ ok: true, data: await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }) });
});

export const documents = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { orderId: req.params.id } });
  if (!shipment?.shiprocketShipmentId) throw ApiError.badRequest('This order has no shipment yet');

  const [label, manifest, invoice] = await Promise.all([
    shipment.labelUrl ? { labelUrl: shipment.labelUrl } : generateLabel(shipment.shiprocketShipmentId).catch(() => ({})),
    shipment.manifestUrl ? { manifestUrl: shipment.manifestUrl } : generateManifest(shipment.shiprocketShipmentId).catch(() => ({})),
    shipment.invoiceUrl ? { invoiceUrl: shipment.invoiceUrl } : generateInvoice(shipment.shiprocketOrderId).catch(() => ({})),
  ]);

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      labelUrl: label.labelUrl ?? shipment.labelUrl,
      manifestUrl: manifest.manifestUrl ?? shipment.manifestUrl,
      invoiceUrl: invoice.invoiceUrl ?? shipment.invoiceUrl,
    },
  });
  res.json({ ok: true, data: updated });
});

export const trackOrder = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { orderId: req.params.id } });
  if (!shipment?.awbCode) throw ApiError.badRequest('No AWB assigned yet');
  res.json({ ok: true, data: await trackByAwb(shipment.awbCode) });
});

export const cancelShipmentForOrder = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { orderId: req.params.id } });
  if (!shipment?.shiprocketOrderId) throw ApiError.badRequest('No shipment to cancel');

  await cancelShipment(shipment.shiprocketOrderId);
  const updated = await prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'CANCELLED' } });
  await logEvent(req.params.id, 'UPDATE', 'Shipment cancelled in Shiprocket', 'ADMIN');
  res.json({ ok: true, data: updated });
});

export const refund = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentStatus !== 'PAID' || !order.razorpayPaymentId) throw ApiError.badRequest('There is no captured payment to refund');

  const amount = req.body.amount ?? order.total;
  if (amount > order.total) throw ApiError.badRequest('Refund cannot exceed the order total');

  const result = await refundPayment(order.razorpayPaymentId, amount);
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'REFUNDED', refundId: result.id } });
  await logEvent(order.id, order.status, `Refunded ₹${amount}${req.body.reason ? ` — ${req.body.reason}` : ''}`, 'ADMIN');

  res.json({ ok: true, data: await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }) });
});

/** GET /api/admin/orders/export.csv */
export const exportCsv = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status && req.query.status !== 'all') where.status = req.query.status;

  const orders = await prisma.order.findMany({ where, orderBy: { placedAt: 'desc' }, include: { items: true, shipment: true } });

  const header = [
    'Order Number', 'Placed At', 'Status', 'Payment', 'Payment Status', 'Customer', 'Phone', 'Email',
    'City', 'State', 'Pincode', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'AWB', 'Courier',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = orders.map((o) =>
    [
      o.orderNumber, new Date(o.placedAt).toISOString(), o.status, o.paymentMethod, o.paymentStatus,
      o.shipName, o.shipPhone, o.shipEmail, o.shipCity, o.shipState, o.shipPincode,
      o.items.map((i) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity}`).join('; '),
      o.subtotal, o.discount, o.shippingFee, o.total,
      o.shipment?.awbCode ?? '', o.shipment?.courierName ?? '',
    ].map(esc).join(','),
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kupaa-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header.map(esc).join(','), ...rows].join('\n'));
});
