import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { round2 } from '../utils/money.js';
import { ALLOWED_TRANSITIONS, cancelOrder, logEvent, orderInclude, pushToCarrier } from '../services/order.service.js';
import { respondWithInvoice } from '../services/invoice.service.js';
import { sendInvoiceToCustomer } from '../services/notify.service.js';
import { refundPayment } from '../services/razorpay.service.js';
import { like } from '../lib/search.js';
import { uploadDir } from '../middleware/upload.js';
import {
  cancelShipment,
  checkServiceability,
  fetchLabel,
  purchaseShipment,
  trackByAwb,
} from '../services/amazon.service.js';

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
  ship: z.object({ serviceId: z.string().trim().max(60).optional() }),

  /**
   * Manual tracking edit. Every field is optional — the admin sends only what
   * changed — but an empty patch is refused so a stray request cannot log an
   * event that says nothing.
   */
  shipment: z
    .object({
      awbCode: z.string().trim().max(80),
      courierName: z.string().trim().max(120),
      carrierShipmentId: z.string().trim().max(80),
      carrierServiceId: z.string().trim().max(60),
      carrierId: z.string().trim().max(60),
      trackingUrl: z.string().trim().max(400),
      etd: z.string().trim().max(40),
      status: z.string().trim().max(60),
      freightCharge: z.coerce.number().min(0).max(100000),
      note: z.string().trim().max(300),
    })
    .partial()
    .refine((v) => Object.keys(v).some((k) => k !== 'note'), { message: 'Nothing to update' }),
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

/** GET /api/admin/orders/:id/rates — Amazon's rate card for this destination. */
export const rates = asyncHandler(async (req, res) => {
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
 * POST /api/admin/orders/:id/ship — the one-click fulfilment action: buy an
 * Amazon Shipping label for the chosen service, store the tracking id and the
 * label, then move the order to SHIPPED.
 *
 * Amazon arranges pickup from the seller's registered address on its own
 * schedule, so there is nothing to book here — the label is the whole job.
 */
export const ship = asyncHandler(async (req, res) => {
  const { serviceId } = req.body;

  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true, shipment: true } });
  if (!order) throw ApiError.notFound('Order not found');
  if (['CANCELLED', 'RETURNED'].includes(order.status)) throw ApiError.badRequest('This order cannot be shipped');
  if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID') {
    throw ApiError.badRequest('Payment has not been received for this order yet');
  }

  let shipment = order.shipment ?? (await pushToCarrier(order));

  if (!shipment.awbCode) {
    const bought = await purchaseShipment(order, { serviceId });
    shipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        carrierShipmentId: bought.carrierShipmentId,
        carrierServiceId: bought.carrierServiceId,
        carrierId: bought.carrierId,
        awbCode: bought.awbCode,
        courierName: bought.courierName,
        freightCharge: bought.freightCharge,
        etd: bought.etd,
        labelUrl: bought.labelUrl,
        status: 'LABEL_PURCHASED',
        trackingUrl: `https://track.amazon.in/tracking/${bought.awbCode}`,
      },
    });
    await logEvent(order.id, order.status, `Label bought — tracking ${bought.awbCode} (${bought.courierName})`, 'AMAZON');
  }

  if (['PENDING', 'CONFIRMED', 'PACKED'].includes(order.status)) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });
    await logEvent(order.id, 'SHIPPED', `Handed to ${shipment.courierName || 'Amazon Shipping'}`, 'AMAZON');
  }

  res.json({ ok: true, data: await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude }) });
});

/**
 * GET /api/admin/orders/:id/documents — the shipping label.
 *
 * Amazon Shipping issues one document per parcel: the label. There is no
 * manifest or commercial invoice endpoint, so this re-downloads the label if we
 * do not have it on file yet.
 */
export const documents = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId: req.params.id },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!shipment?.carrierShipmentId) throw ApiError.badRequest('This order has no label yet');

  const { order, ...row } = shipment;
  if (row.labelUrl) return res.json({ ok: true, data: row });

  const { labelUrl } = await fetchLabel(row.carrierShipmentId, { orderNumber: order.orderNumber }).catch(() => ({}));

  const updated = await prisma.shipment.update({
    where: { id: row.id },
    data: { labelUrl: labelUrl ?? row.labelUrl },
  });
  res.json({ ok: true, data: updated });
});

/** GET /api/admin/orders/:id/label — download the Amazon shipping label. */
export const downloadLabel = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId: req.params.id },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!shipment?.carrierShipmentId) throw ApiError.badRequest('This order has no label yet');

  let labelUrl = shipment.labelUrl;
  if (!labelUrl || labelUrl.includes('example.invalid')) {
    ({ labelUrl } = await fetchLabel(shipment.carrierShipmentId, { orderNumber: shipment.order.orderNumber }));
    if (labelUrl) {
      await prisma.shipment.update({ where: { id: shipment.id }, data: { labelUrl } });
    }
  }
  if (!labelUrl) throw ApiError.upstream('Amazon did not return a shipping label');

  if (!labelUrl.startsWith('/uploads/')) return res.redirect(labelUrl);

  const filename = `LABEL-${shipment.order.orderNumber}.pdf`;
  res.download(path.join(uploadDir, path.basename(labelUrl)), filename);
});

export const trackOrder = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { orderId: req.params.id } });
  if (!shipment?.awbCode) throw ApiError.badRequest('No tracking number yet — buy the label first');
  res.json({ ok: true, data: await trackByAwb(shipment.awbCode, shipment.carrierId) });
});

export const cancelShipmentForOrder = asyncHandler(async (req, res) => {
  const shipment = await prisma.shipment.findUnique({ where: { orderId: req.params.id } });
  if (!shipment?.carrierShipmentId) throw ApiError.badRequest('No shipment to cancel');

  await cancelShipment(shipment.carrierShipmentId);
  const updated = await prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'CANCELLED' } });
  await logEvent(req.params.id, 'UPDATE', 'Label cancelled with Amazon Shipping', 'ADMIN');
  res.json({ ok: true, data: updated });
});

/**
 * PATCH /api/admin/orders/:id/shipment — type the tracking details in by hand.
 *
 * Needed whenever the carrier is not driving the record: a parcel handed over
 * at a counter, a courier booked outside Amazon, or a tracking number Amazon
 * reissued. Creates the shipment row if the order does not have one yet, and
 * writes what changed onto the order timeline.
 */
export const updateShipment = asyncHandler(async (req, res) => {
  const { note, ...patch } = req.body;

  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { shipment: true } });
  if (!order) throw ApiError.notFound('Order not found');

  // '' clears a field; a missing key leaves it alone.
  const data = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, typeof value === 'string' && !value.trim() ? null : value]),
  );

  // Fill in the Amazon tracking link when the parcel is plainly an Amazon one
  // and the admin did not paste a link. Anything else — another courier, a
  // hand delivery — is left without a link rather than pointing at a page that
  // will never know the number.
  const courier = data.courierName ?? order.shipment?.courierName ?? '';
  const looksAmazon = /amazon/i.test(courier) || Boolean(data.carrierShipmentId ?? order.shipment?.carrierShipmentId);
  if (data.awbCode && looksAmazon && patch.trackingUrl === undefined && !order.shipment?.trackingUrl) {
    data.trackingUrl = `https://track.amazon.in/tracking/${encodeURIComponent(data.awbCode)}`;
  }

  const shipment = await prisma.shipment.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, status: 'MANUAL', ...data },
    update: data,
  });

  const changed = Object.entries(data)
    .map(([key, value]) => `${key} = ${value ?? '—'}`)
    .join(', ');
  await logEvent(order.id, 'UPDATE', `Tracking edited by admin: ${changed}${note ? ` — ${note}` : ''}`, 'ADMIN');

  res.json({ ok: true, data: shipment });
});

/** GET /api/admin/orders/:id/invoice — the invoice PDF for any order. */
export const invoice = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: req.params.id }, { orderNumber: req.params.id }] },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Order not found');
  await respondWithInvoice(res, order);
});

/**
 * POST /api/admin/orders/:id/invoice/whatsapp — send (or resend) the invoice to
 * the customer, for when the automatic send failed or they ask for it again.
 */
export const whatsappInvoice = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw ApiError.notFound('Order not found');

  const result = await sendInvoiceToCustomer(order.id, { force: true });
  if (!result) throw ApiError.badRequest('WhatsApp would not accept that number — check the phone on this order');

  res.json({ ok: true, data: { to: result.to, messageId: result.messageId, mock: Boolean(result.mock) } });
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
    'City', 'State', 'Pincode', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Tracking ID', 'Carrier',
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
