import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { buildInvoicePdf, invoiceFilename, invoiceNumber, loadOrderForInvoice } from './invoice.service.js';
import { logEvent } from './order.service.js';
import { getSettings } from './settings.service.js';
import { isMock, ownerNumber, sendDocument, sendTemplate, sendText, uploadMedia } from './whatsapp.service.js';

/**
 * WhatsApp notifications for orders.
 *
 * Every function here is safe to call and forget: a notification failure is
 * recorded on the order timeline and logged, but never propagated, because
 * nothing about checkout or a payment webhook should fail over a message that
 * did not go out. The admin can resend from the order page.
 */

const money = (n) => `Rs. ${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Customer messages go to the number on the order — the one the courier calls. */
const customerNumber = (order) => order.shipPhone;

const itemLines = (order) =>
  order.items.map((i) => `• ${i.name}${i.variantName ? ` (${i.variantName})` : ''} × ${i.quantity}`).join('\n');

/** Wraps a send so the outcome lands on the order timeline either way. */
async function record(orderId, label, send) {
  try {
    const result = await send();
    await logEvent(orderId, 'UPDATE', `${label} sent → +${result.to}${isMock() ? ' (mock mode)' : ''}`, 'WHATSAPP');
    return result;
  } catch (err) {
    logger.error('[notify]', label, err.message);
    await logEvent(orderId, 'UPDATE', `${label} could not be sent: ${String(err.message).slice(0, 200)}`, 'WHATSAPP').catch(
      () => {},
    );
    return null;
  }
}

// ------------------------------------------------------------- owner alerts

/** New order, straight after checkout. Goes to WHATSAPP_OWNER_NUMBER. */
export async function notifyOwnerNewOrder(order) {
  const settings = await getSettings();
  if (!settings.whatsappNotifyOwner) return null;

  const to = ownerNumber();
  if (!to) {
    logger.warn('[notify] no owner WhatsApp number configured — new order alert skipped');
    return null;
  }

  const full = order.items ? order : await loadOrderForInvoice(order.id);
  const paid = full.paymentMethod === 'COD' ? 'Cash on delivery' : `Online — ${full.paymentStatus.toLowerCase()}`;

  return record(full.id, 'New order alert', () => {
    const template = env.whatsapp.templates.newOrder;
    if (template) {
      // Template body placeholders, in order: order no, total, payment, customer, city, item count.
      return sendTemplate(to, template, [
        full.orderNumber,
        money(full.total),
        paid,
        full.shipName,
        full.shipCity,
        String(full.items.length),
      ]);
    }
    return sendText(
      to,
      [
        `New order ${full.orderNumber}`,
        `${money(full.total)} · ${paid}`,
        '',
        itemLines(full),
        '',
        `${full.shipName}, ${full.shipCity} ${full.shipPincode}`,
        `Phone: ${full.shipPhone}`,
      ].join('\n'),
    );
  });
}

/** Online payment landed on an order that was placed unpaid. */
export async function notifyOwnerPaymentReceived(order) {
  const settings = await getSettings();
  if (!settings.whatsappNotifyOwner) return null;

  const to = ownerNumber();
  if (!to) return null;

  return record(order.id, 'Payment alert', () => {
    const template = env.whatsapp.templates.paymentReceived;
    if (template) return sendTemplate(to, template, [order.orderNumber, money(order.total), order.shipName]);
    return sendText(
      to,
      `Payment received for ${order.orderNumber} — ${money(order.total)} from ${order.shipName}. Ready to pack.`,
    );
  });
}

// ---------------------------------------------------------- customer invoice

/**
 * Sends the invoice PDF to the customer's WhatsApp.
 *
 * `force` is the admin resend: without it an order whose invoice already went
 * out is left alone, so a retried Razorpay webhook cannot double-send.
 */
export async function sendInvoiceToCustomer(orderId, { force = false } = {}) {
  const settings = await getSettings();
  if (!settings.whatsappSendInvoice && !force) return null;

  const order = await loadOrderForInvoice(orderId);
  if (!order) return null;

  // Razorpay's callback and its webhook both report the same payment, and they
  // can arrive together. Claiming `invoiceSentAt` with a conditional update is
  // the lock: whoever flips it from null owns the send, and a failure puts it
  // back so a resend is still possible.
  if (!force) {
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, invoiceSentAt: null },
      data: { invoiceSentAt: new Date() },
    });
    if (claimed.count === 0) return null;
  }

  const filename = invoiceFilename(order);

  const result = await record(order.id, 'Invoice', async () => {
    const pdf = await buildInvoicePdf(order, settings);
    const { mediaId } = await uploadMedia(pdf, { filename });

    const caption = `Invoice ${invoiceNumber(order)} for your order ${order.orderNumber} — ${money(order.total)} paid. Thank you!`;
    const template = env.whatsapp.templates.invoice;

    // A business-initiated document needs a template with a document header;
    // without one we send the document directly, which works inside the
    // customer's 24-hour window and for test numbers.
    if (template) {
      return sendTemplate(customerNumber(order), template, [order.shipName, order.orderNumber, money(order.total)], {
        documentId: mediaId,
        filename,
      });
    }
    return sendDocument(customerNumber(order), { mediaId, filename, caption });
  });

  if (result) {
    if (force) await prisma.order.update({ where: { id: order.id }, data: { invoiceSentAt: new Date() } });
  } else if (!force) {
    // Release the claim so the admin (or a later retry) can send it again.
    await prisma.order.update({ where: { id: order.id }, data: { invoiceSentAt: null } }).catch(() => {});
  }
  return result;
}
