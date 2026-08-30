import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { toPaise } from '../utils/money.js';
import { getSettings } from './settings.service.js';

let client = null;
if (env.razorpay.enabled) {
  client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
}

export const razorpayEnabled = () => Boolean(client);

function requireClient() {
  if (!client) throw ApiError.badRequest('Online payment is not configured. Please choose Cash on Delivery.');
  return client;
}

/** Creates a Razorpay order for the given rupee amount. */
export async function createRazorpayOrder({ amount, receipt, notes }) {
  const rzp = requireClient();
  try {
    return await rzp.orders.create({
      amount: toPaise(amount),
      currency: (await getSettings()).currency,
      receipt: String(receipt).slice(0, 40),
      notes,
    });
  } catch (err) {
    logger.error('[razorpay] order create failed', err?.error || err);
    throw ApiError.upstream('Could not start the payment. Please try again.', err?.error?.description);
  }
}

/** HMAC check for the checkout handler callback (order_id|payment_id). */
export function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

/** HMAC check for webhook deliveries (raw request body). */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function fetchPayment(paymentId) {
  return requireClient().payments.fetch(paymentId);
}

export async function refundPayment(paymentId, amount) {
  const rzp = requireClient();
  try {
    return await rzp.payments.refund(paymentId, amount ? { amount: toPaise(amount), speed: 'normal' } : { speed: 'normal' });
  } catch (err) {
    logger.error('[razorpay] refund failed', err?.error || err);
    throw ApiError.upstream('Refund could not be issued', err?.error?.description);
  }
}
