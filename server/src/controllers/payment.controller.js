import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fromPaise } from '../utils/money.js';
import { confirmOrder, logEvent, orderInclude, restockOrder } from '../services/order.service.js';
import { getSettings } from '../services/settings.service.js';
import {
  createRazorpayOrder,
  razorpayEnabled,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../services/razorpay.service.js';

export const schemas = {
  verify: z.object({
    orderId: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }),
  failed: z.object({ orderId: z.string().min(1), reason: z.string().max(300).optional() }),
};

/** GET /api/payments/config — what the checkout page is allowed to offer. */
export const config = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json({
    ok: true,
    data: {
      razorpay: { enabled: razorpayEnabled(), keyId: razorpayEnabled() ? env.razorpay.keyId : null },
      cod: { enabled: settings.codEnabled, extraFee: settings.codExtraFee },
      currency: settings.currency,
      storeName: settings.storeName,
    },
  });
});

/** POST /api/payments/verify — called by the Razorpay checkout success handler. */
export const verify = asyncHandler(async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const order = await prisma.order.findFirst({ where: { id: orderId, userId: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.razorpayOrderId !== razorpay_order_id) throw ApiError.badRequest('Payment does not match this order');

  const valid = verifyCheckoutSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    await logEvent(order.id, order.status, 'Payment signature verification failed', 'RAZORPAY');
    throw ApiError.badRequest('We could not verify this payment. If money was deducted it will be refunded automatically.');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'PAID',
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    },
  });
  await logEvent(order.id, order.status, `Payment received (${razorpay_payment_id})`, 'RAZORPAY');

  const confirmed = await confirmOrder(order.id, { source: 'RAZORPAY', message: 'Payment verified' });
  res.json({ ok: true, data: confirmed ?? (await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude })) });
});

/** POST /api/payments/retry/:orderId — new Razorpay order for an unpaid order. */
export const retry = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.orderId, userId: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentStatus === 'PAID') throw ApiError.badRequest('This order is already paid');
  if (order.status === 'CANCELLED') throw ApiError.badRequest('This order was cancelled');

  const rzpOrder = await createRazorpayOrder({
    amount: order.total,
    receipt: order.orderNumber,
    notes: { orderId: order.id, orderNumber: order.orderNumber, retry: 'true' },
  });
  await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzpOrder.id } });

  res.json({
    ok: true,
    data: {
      provider: 'razorpay',
      keyId: env.razorpay.keyId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      name: (await getSettings()).storeName,
      description: `Order ${order.orderNumber}`,
      prefill: { name: req.user.name, email: req.user.email, contact: order.shipPhone },
    },
  });
});

/** POST /api/payments/failed — customer dismissed or the gateway declined. */
export const markFailed = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.body.orderId, userId: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentStatus === 'PAID') return res.json({ ok: true, data: { message: 'Already paid' } });

  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
  await logEvent(order.id, order.status, req.body.reason || 'Payment was not completed', 'RAZORPAY');
  res.json({ ok: true, data: { message: 'Recorded. You can retry the payment from your orders page.' } });
});

/**
 * POST /api/payments/webhook — mounted with a raw body parser so the HMAC can
 * be computed over the exact bytes Razorpay signed.
 *
 * Always answers 200 once the signature checks out: Razorpay retries on any
 * non-2xx and we do not want duplicate deliveries for a handler-side bug.
 */
export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);

  if (!verifyWebhookSignature(raw, signature)) {
    await prisma.webhookLog.create({
      data: { source: 'RAZORPAY', event: 'invalid-signature', payload: raw.slice(0, 4000), ok: false, error: 'bad signature' },
    });
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  const body = JSON.parse(raw);
  const event = body.event;
  res.json({ ok: true }); // acknowledge before doing work

  try {
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    const rzpOrderId = payment?.order_id || refund?.notes?.razorpay_order_id;
    const order = rzpOrderId ? await prisma.order.findFirst({ where: { razorpayOrderId: rzpOrderId } }) : null;

    if (order) {
      if (event === 'payment.captured' && order.paymentStatus !== 'PAID') {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'PAID', razorpayPaymentId: payment.id },
        });
        await logEvent(order.id, order.status, `Payment captured — ₹${fromPaise(payment.amount)}`, 'RAZORPAY');
        await confirmOrder(order.id, { source: 'RAZORPAY', message: 'Confirmed via webhook' });
      } else if (event === 'payment.failed' && order.paymentStatus === 'PENDING') {
        await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
        await logEvent(order.id, order.status, payment?.error_description || 'Payment failed', 'RAZORPAY');
        // Release the reserved stock so it is sellable again.
        if (order.status === 'PENDING') {
          await prisma.$transaction(async (tx) => {
            await restockOrder(tx, order.id);
            await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
          });
          await logEvent(order.id, 'CANCELLED', 'Cancelled automatically after payment failure', 'RAZORPAY');
        }
      } else if (event?.startsWith('refund.')) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'REFUNDED', refundId: refund?.id ?? null },
        });
        await logEvent(order.id, order.status, `Refund ${event.split('.')[1]} — ₹${fromPaise(refund?.amount || 0)}`, 'RAZORPAY');
      }
    }

    await prisma.webhookLog.create({ data: { source: 'RAZORPAY', event, payload: raw.slice(0, 4000), ok: true } });
  } catch (err) {
    logger.error('[razorpay webhook]', err);
    await prisma.webhookLog.create({
      data: { source: 'RAZORPAY', event, payload: raw.slice(0, 4000), ok: false, error: String(err.message).slice(0, 500) },
    });
  }
});
