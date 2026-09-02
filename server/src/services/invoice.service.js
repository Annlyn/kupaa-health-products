import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { orderInclude } from './order.service.js';
import { getSettings } from './settings.service.js';

/**
 * Invoices are generated on demand rather than stored: everything on them comes
 * from the order snapshot, which never changes after the order is placed. That
 * keeps customer addresses out of the public uploads directory — the download
 * endpoint streams the bytes behind auth, and the WhatsApp send uploads them
 * straight to Meta.
 */

/** Helvetica has no ₹ glyph, so money is written out rather than symbolised. */
const rupees = (n) =>
  `Rs. ${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const invoiceDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const invoiceNumber = (order) => `INV-${order.orderNumber}`;
export const invoiceFilename = (order) => `${invoiceNumber(order)}.pdf`;

/** The order with everything an invoice needs, whatever the caller had. */
export const loadOrderForInvoice = (id) =>
  prisma.order.findFirst({ where: { OR: [{ id }, { orderNumber: id }] }, include: orderInclude });

/** Streams the invoice as a download. Used by both the customer and the admin. */
export async function respondWithInvoice(res, order, settings) {
  const pdf = await buildInvoicePdf(order, settings);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `attachment; filename="${invoiceFilename(order)}"`);
  res.end(pdf);
}

const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const BRAND = '#0f766e';

/** Renders the invoice and resolves with the whole PDF as one buffer. */
export async function buildInvoicePdf(order, settings) {
  const store = settings ?? (await getSettings());
  // The pickup address is the business address — the same one the carrier
  // collects from and the one that belongs on an invoice.
  const from = env.amazon.shipFrom;

  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: invoiceNumber(order), Author: store.storeName } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ------------------------------------------------------------------ header
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text(store.storeName, left, 48);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(
      [from.line1, from.line2, `${from.city}, ${from.state} ${from.pincode}`, store.supportEmail, store.supportPhone]
        .filter(Boolean)
        .join('\n'),
      { width: width * 0.55 },
    );

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text('TAX INVOICE', left, 52, { width, align: 'right' });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(
      [
        `Invoice no: ${invoiceNumber(order)}`,
        `Order no: ${order.orderNumber}`,
        `Date: ${invoiceDate(order.placedAt)}`,
      ].join('\n'),
      left,
      74,
      { width, align: 'right' },
    );

  let y = 150;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 18;

  // --------------------------------------------------------------- addresses
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('BILLED & SHIPPED TO', left, y);
  doc
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(10)
    .text(
      [
        order.shipName,
        order.shipLine1,
        order.shipLine2,
        `${order.shipCity}, ${order.shipState} ${order.shipPincode}`,
        order.shipCountry,
        order.shipPhone,
        order.shipEmail,
      ]
        .filter(Boolean)
        .join('\n'),
      left,
      y + 14,
      { width: width * 0.5 },
    );

  const payment = [
    ['Payment', order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online (Razorpay)'],
    ['Status', order.paymentStatus],
    order.razorpayPaymentId && ['Payment ID', order.razorpayPaymentId],
    order.couponCode && ['Coupon', order.couponCode],
    order.shipment?.awbCode && ['Tracking', order.shipment.awbCode],
  ].filter(Boolean);

  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('PAYMENT', left + width * 0.55, y);
  doc.font('Helvetica').fontSize(10);
  payment.forEach(([label, value], i) => {
    doc.fillColor(MUTED).text(label, left + width * 0.55, y + 14 + i * 14, { width: width * 0.16, continued: false });
    doc.fillColor(INK).text(String(value), left + width * 0.72, y + 14 + i * 14, { width: width * 0.28, align: 'right' });
  });

  y += Math.max(110, 24 + payment.length * 14);

  // ------------------------------------------------------------------- items
  const columns = [
    { key: 'item', label: 'Item', x: left, w: width * 0.46, align: 'left' },
    { key: 'qty', label: 'Qty', x: left + width * 0.48, w: width * 0.08, align: 'right' },
    { key: 'rate', label: 'Rate', x: left + width * 0.58, w: width * 0.18, align: 'right' },
    { key: 'amount', label: 'Amount', x: left + width * 0.78, w: width * 0.22, align: 'right' },
  ];

  const headerRow = (top) => {
    doc.rect(left, top, width, 22).fill('#f3f4f6');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
    for (const col of columns) doc.text(col.label.toUpperCase(), col.x + 6, top + 7, { width: col.w - 12, align: col.align });
    return top + 22;
  };

  y = headerRow(y);
  doc.font('Helvetica').fontSize(10);

  for (const item of order.items) {
    // Start a fresh page before a row would run off the bottom.
    if (y > doc.page.height - 190) {
      doc.addPage();
      y = headerRow(48);
      doc.font('Helvetica').fontSize(10);
    }

    const name = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    const height = doc.heightOfString(name, { width: columns[0].w - 12 }) + 22;

    doc.fillColor(INK).text(name, columns[0].x + 6, y + 6, { width: columns[0].w - 12 });
    doc.fillColor(MUTED).fontSize(8).text(`SKU ${item.sku}`, columns[0].x + 6, y + height - 14, { width: columns[0].w - 12 });
    doc.fillColor(INK).fontSize(10);
    doc.text(String(item.quantity), columns[1].x + 6, y + 6, { width: columns[1].w - 12, align: 'right' });
    doc.text(rupees(item.price), columns[2].x + 6, y + 6, { width: columns[2].w - 12, align: 'right' });
    doc.text(rupees(item.price * item.quantity), columns[3].x + 6, y + 6, { width: columns[3].w - 12, align: 'right' });

    y += height;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).stroke();
  }

  // ------------------------------------------------------------------ totals
  y += 14;
  const totals = [
    ['Subtotal', order.subtotal],
    order.discount > 0 && [`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, -order.discount],
    ['Delivery', order.shippingFee],
    order.tax > 0 && ['Tax', order.tax],
  ].filter(Boolean);

  doc.fontSize(10);
  for (const [label, value] of totals) {
    doc.fillColor(MUTED).font('Helvetica').text(label, left + width * 0.55, y, { width: width * 0.2 });
    doc.fillColor(INK).text(rupees(value), left + width * 0.78, y, { width: width * 0.22, align: 'right' });
    y += 16;
  }

  y += 4;
  doc.moveTo(left + width * 0.55, y).lineTo(right, y).strokeColor(RULE).stroke();
  y += 10;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12);
  doc.text('Total', left + width * 0.55, y, { width: width * 0.2 });
  doc.text(rupees(order.total), left + width * 0.78, y, { width: width * 0.22, align: 'right' });

  // ------------------------------------------------------------------ footer
  const footer = [
    order.paymentStatus === 'PAID' ? 'Paid in full. Thank you for your order.' : 'Amount payable on delivery.',
    'This is a computer-generated invoice.',
    store.footerNote,
  ]
    .filter(Boolean)
    .join(' · ');

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(footer, left, doc.page.height - 80, { width, align: 'center' });

  doc.end();
  return done;
}
