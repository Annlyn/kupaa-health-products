import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { round2 } from '../utils/money.js';
import { ensureUploadDir } from '../middleware/upload.js';

/**
 * Thin Amazon Shipping (SP-API Shipping v2) client.
 *
 * Auth: Login with Amazon exchanges the long-lived refresh token for an access
 * token valid one hour. We cache it in memory and refresh on expiry, or on the
 * first 401 from any call.
 *
 * The flow differs from a broker API in one way worth knowing: nothing exists
 * on Amazon's side until a label is bought. `getRates` returns a `requestToken`
 * plus a set of rates, and a purchase quotes `requestToken` + `rateId`. Both
 * expire in minutes, so `purchaseShipment` always re-quotes rather than relying
 * on a rate the admin looked at earlier.
 *
 * When credentials are absent the module runs in MOCK mode so the whole
 * checkout and fulfilment flow stays testable locally.
 */

const LWA_URL = 'https://api.amazon.com/auth/o2/token';
const TOKEN_TTL_MS = 55 * 60 * 1000; // Amazon issues 3600s tokens; refresh early

let cached = { token: null, fetchedAt: 0 };

export const amazonShippingEnabled = () => env.amazon.enabled;
export const isMock = () => !env.amazon.enabled;

/** The configured origin, used for rate quotes and shown under Integrations. */
export const shipFromAddress = () => ({
  name: env.amazon.shipFrom.name,
  addressLine1: env.amazon.shipFrom.line1,
  ...(env.amazon.shipFrom.line2 ? { addressLine2: env.amazon.shipFrom.line2 } : {}),
  city: env.amazon.shipFrom.city,
  stateOrRegion: env.amazon.shipFrom.state,
  postalCode: env.amazon.shipFrom.pincode,
  countryCode: env.amazon.shipFrom.country,
  phoneNumber: env.amazon.shipFrom.phone,
  ...(env.amazon.shipFrom.email ? { email: env.amazon.shipFrom.email } : {}),
});

async function login() {
  const res = await fetch(LWA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.amazon.refreshToken,
      client_id: env.amazon.clientId,
      client_secret: env.amazon.clientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    logger.error('[amazon] LWA token exchange failed', res.status, data);
    throw ApiError.upstream('Could not authenticate with Amazon Shipping', data?.error_description || data?.error);
  }
  cached = { token: data.access_token, fetchedAt: Date.now() };
  logger.info('[amazon] authenticated');
  return cached.token;
}

async function getToken(force = false) {
  if (!env.amazon.enabled) throw ApiError.badRequest('Amazon Shipping is not configured');
  if (force || !cached.token || Date.now() - cached.fetchedAt > TOKEN_TTL_MS) return login();
  return cached.token;
}

async function call(path_, { method = 'GET', body, query, retry = true } = {}) {
  const token = await getToken();
  const url = new URL(`${env.amazon.endpoint}${path_}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      'x-amz-access-token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    await getToken(true);
    return call(path_, { method, body, query, retry: false });
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    logger.error('[amazon]', method, path_, res.status, data);
    // SP-API reports problems as { errors: [{ code, message, details }] }.
    const message = data?.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'Amazon Shipping request failed';
    throw ApiError.upstream(`Amazon Shipping: ${message}`, data);
  }
  return data?.payload ?? data;
}

// ------------------------------------------------------------------- payloads

const CURRENCY = 'INR';

const shipToFromOrder = (order) => ({
  name: order.shipName,
  addressLine1: order.shipLine1,
  ...(order.shipLine2 ? { addressLine2: order.shipLine2 } : {}),
  city: order.shipCity,
  stateOrRegion: order.shipState,
  postalCode: order.shipPincode,
  countryCode: order.shipCountry === 'India' ? 'IN' : order.shipCountry || 'IN',
  phoneNumber: order.shipPhone,
  ...(order.shipEmail ? { email: order.shipEmail } : {}),
});

/**
 * One parcel, not per-item dimensions: everything in an order ships together.
 * Amazon rejects zero weights and needs the packed size, so the height grows
 * with the number of units the way a real box does.
 */
export function buildPackage(order, { weightKg, declaredValue } = {}) {
  const items = order.items ?? [];
  const weight = weightKg ?? items.reduce((w, i) => w + (i.weightKg || 0.3) * i.quantity, 0);
  const value = declaredValue ?? items.reduce((t, i) => t + i.price * i.quantity, 0);
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const length = Math.max(15, ...items.map((i) => i.lengthCm || i.product?.lengthCm || 15));
  const width = Math.max(10, ...items.map((i) => i.breadthCm || i.product?.breadthCm || 10));
  const height = Math.max(5, ...items.map((i) => i.heightCm || i.product?.heightCm || 5));

  return {
    dimensions: {
      length,
      width,
      height: Math.max(height, Math.ceil(height + Math.max(0, units - 1) * 2)),
      unit: 'CENTIMETER',
    },
    weight: { value: Math.max(0.05, round2(weight)), unit: 'KILOGRAM' },
    insuredValue: { value: round2(Math.max(1, value)), unit: CURRENCY },
    packageClientReferenceId: order.orderNumber,
    items: items.map((i) => ({
      // The packer needs to see the size on the label, not just the product.
      itemIdentifier: i.sku,
      description: (i.variantName ? `${i.name} (${i.variantName})` : i.name).slice(0, 100),
      quantity: i.quantity,
      weight: { value: Math.max(0.05, round2(i.weightKg || 0.3)), unit: 'KILOGRAM' },
      itemValue: { value: round2(i.price), unit: CURRENCY },
      isHazmat: false,
    })),
  };
}

/** A rate quote: the raw Amazon response plus the shape our callers expect. */
async function getRates({ shipTo, package: pkg, cod = false }) {
  const data = await call('/shipping/v2/shipments/rates', {
    method: 'POST',
    body: {
      shipTo,
      shipFrom: shipFromAddress(),
      packages: [pkg],
      channelDetails: { channelType: 'EXTERNAL' },
      // Amazon exposes cash on delivery as a value-added service on the rate,
      // and only some services carry it. Asking for it filters the rate card to
      // the ones that can actually collect on our behalf.
      ...(cod
        ? {
            valueAddedServices: {
              collectOnDelivery: { amount: { value: round2(pkg.insuredValue.value), unit: CURRENCY } },
            },
          }
        : {}),
    },
  });

  return {
    requestToken: data?.requestToken ?? null,
    rates: (data?.rates || []).map(normaliseRate),
  };
}

function normaliseRate(rate) {
  const end = rate?.promise?.deliveryWindow?.end;
  const days = end ? Math.max(1, Math.ceil((new Date(end) - Date.now()) / 86400_000)) : null;

  return {
    rateId: rate.rateId,
    // What the admin picks and what we store: a service survives across quotes,
    // a rateId does not.
    serviceId: rate.serviceId ?? rate.serviceName ?? rate.rateId,
    name: [rate.carrierName, rate.serviceName].filter(Boolean).join(' · ') || 'Amazon Shipping',
    carrierId: rate.carrierId ?? null,
    carrierName: rate.carrierName ?? 'Amazon Shipping',
    serviceName: rate.serviceName ?? null,
    rate: round2(rate?.totalCharge?.value ?? 0),
    etd: end ? new Date(end).toISOString().slice(0, 10) : null,
    estimatedDays: days,
    cod: Boolean(
      rate?.availableValueAddedServiceGroups?.some((g) =>
        (g.valueAddedServices || []).some((s) => /COLLECT_ON_DELIVERY|COD/i.test(s.id || s.name || '')),
      ),
    ),
  };
}

// ------------------------------------------------------------------ read APIs

/**
 * Delivery options and prices from the pickup address to a PIN code.
 * An empty rate card is Amazon's way of saying "not serviceable".
 */
export async function checkServiceability({ deliveryPincode, weightKg = 0.5, cod = false, declaredValue = 0 }) {
  if (isMock()) return mockServiceability(deliveryPincode, weightKg, cod);

  const pkg = buildPackage({ orderNumber: `QUOTE-${Date.now()}`, items: [] }, { weightKg, declaredValue });
  const { rates } = await getRates({
    shipTo: {
      name: 'Delivery check',
      addressLine1: '-',
      city: '-',
      stateOrRegion: '-',
      postalCode: String(deliveryPincode),
      countryCode: 'IN',
      phoneNumber: env.amazon.shipFrom.phone,
    },
    package: pkg,
    cod,
  });

  const services = rates.slice().sort((a, b) => a.rate - b.rate);
  return {
    serviceable: services.length > 0,
    services,
    recommended: services[0]?.serviceId ?? null,
  };
}

/** Tracking for a label we bought. `awb` is Amazon's trackingId. */
export async function trackByAwb(awb, carrierId) {
  if (isMock()) return mockTracking(awb);

  const data = await call('/shipping/v2/tracking', {
    query: { trackingId: awb, carrierId: carrierId || env.amazon.carrierId },
  });

  const events = (data?.eventHistory || [])
    .slice()
    .sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));

  return {
    status: data?.summary?.status || events[0]?.eventCode || 'In Transit',
    awb,
    courier: data?.carrierName || 'Amazon Shipping',
    trackUrl: awb ? `https://track.amazon.in/tracking/${encodeURIComponent(awb)}` : null,
    edd: data?.promisedDeliveryDate ? String(data.promisedDeliveryDate).slice(0, 10) : null,
    activities: events.map((e) => ({
      date: String(e.eventTime || '').slice(0, 16).replace('T', ' '),
      status: e.eventCode,
      activity: humaniseEvent(e.eventCode),
      location: [e.location?.city, e.location?.stateOrRegion].filter(Boolean).join(', ') || null,
    })),
  };
}

/** Amazon event codes are CamelCase tokens — "OutForDelivery". */
export const humaniseEvent = (code = '') =>
  String(code)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

// ----------------------------------------------------------------- write APIs

/**
 * Buys a label. `serviceId` is what the admin chose off the rate card; when it
 * is gone by the time we purchase (rates move), we fall back to the cheapest
 * rate still on offer rather than failing the fulfilment.
 */
export async function purchaseShipment(order, { serviceId } = {}) {
  if (isMock()) return mockPurchase(order, serviceId);

  const pkg = buildPackage(order);
  const { requestToken, rates } = await getRates({
    shipTo: shipToFromOrder(order),
    package: pkg,
    cod: order.paymentMethod === 'COD',
  });

  if (!rates.length) throw ApiError.upstream(`Amazon Shipping has no service for ${order.shipPincode}`);
  const chosen = rates.find((r) => r.serviceId === serviceId) ?? rates.slice().sort((a, b) => a.rate - b.rate)[0];

  const data = await call('/shipping/v2/shipments', {
    method: 'POST',
    body: {
      requestToken,
      rateId: chosen.rateId,
      requestedDocumentSpecification: {
        format: 'PDF',
        size: { width: 4, length: 6, unit: 'INCH' },
        dpi: 300,
        pageLayout: 'DEFAULT',
        needFileJoining: false,
        requestedDocumentTypes: ['LABEL'],
      },
      ...(order.paymentMethod === 'COD'
        ? {
            requestedValueAddedServices: [{ id: 'COLLECT_ON_DELIVERY' }],
          }
        : {}),
    },
  });

  const parcel = data?.packageDocumentDetails?.[0] ?? {};
  const label = (parcel.packageDocuments || []).find((d) => d.type === 'LABEL') ?? parcel.packageDocuments?.[0];

  return {
    carrierShipmentId: String(data?.shipmentId ?? ''),
    carrierServiceId: chosen.serviceId,
    carrierId: chosen.carrierId,
    awbCode: String(parcel.trackingId ?? ''),
    courierName: chosen.name,
    freightCharge: chosen.rate,
    etd: chosen.etd,
    labelUrl: label?.contents ? await saveLabel(order.orderNumber, label) : null,
  };
}

/** Re-downloads the label for a shipment we already bought. */
export async function fetchLabel(shipmentId, { orderNumber, packageClientReferenceId } = {}) {
  if (isMock()) return { labelUrl: await saveLabel(orderNumber || shipmentId, mockLabelDocument()) };

  const data = await call(`/shipping/v2/shipments/${encodeURIComponent(shipmentId)}/documents`, {
    query: { packageClientReferenceId: packageClientReferenceId || orderNumber, format: 'PDF' },
  });

  const label = (data?.packageDocuments || []).find((d) => d.type === 'LABEL') ?? data?.packageDocuments?.[0];
  return { labelUrl: label?.contents ? await saveLabel(orderNumber || shipmentId, label) : null };
}

export async function cancelShipment(shipmentId) {
  if (isMock()) return { cancelled: true };
  await call(`/shipping/v2/shipments/${encodeURIComponent(shipmentId)}/cancel`, { method: 'PUT' });
  return { cancelled: true };
}

/**
 * Amazon hands labels back as base64 in the purchase response — there is no URL
 * to link to. We write the bytes next to the product uploads so the admin can
 * open and print one from the order page.
 */
async function saveLabel(reference, document_) {
  const ext = String(document_.format || 'PDF').toLowerCase() === 'png' ? 'png' : 'pdf';
  const safe = String(reference || 'shipment').replace(/[^A-Za-z0-9_-]/g, '');
  // /uploads is served publicly, and a label carries the customer's address —
  // the random suffix keeps the URL from being guessable off an order number.
  const name = `label-${safe}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  const dir = ensureUploadDir();
  await fs.writeFile(path.join(dir, name), Buffer.from(document_.contents, 'base64'));
  return `/uploads/${name}`;
}

// ---------------------------------------------------------------- mock mode
// Deterministic fake responses so checkout, the admin console and the tracking
// page all work end-to-end before real Amazon Shipping credentials exist.

const nonServiceable = new Set(['000000', '111111']);

function mockLabelDocument() {
  const text = 'BT /F1 18 Tf 50 740 Td (MOCK AMAZON SHIPPING LABEL) Tj 0 -32 Td /F1 11 Tf (Demo label - replace with live Amazon label) Tj ET';
  const objectBodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 432] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  const header = Buffer.from('%PDF-1.4\n');
  const chunks = [header];
  const offsets = [0];
  let position = header.length;

  objectBodies.forEach((body, index) => {
    const object = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`);
    offsets.push(position);
    chunks.push(object);
    position += object.length;
  });

  const xrefOffset = position;
  const xref = [`xref\n0 ${objectBodies.length + 1}`, '0000000000 65535 f '];
  offsets.slice(1).forEach((offset) => xref.push(`${String(offset).padStart(10, '0')} 00000 n `));
  const trailer = `\ntrailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(`${xref.join('\n')}${trailer}`));

  return { format: 'PDF', contents: Buffer.concat(chunks).toString('base64') };
}

function mockServiceability(pincode, weightKg, cod) {
  if (!/^\d{6}$/.test(String(pincode)) || nonServiceable.has(String(pincode))) {
    return { serviceable: false, services: [], recommended: null, mock: true };
  }
  const base = 45 + Math.max(0, Math.ceil(weightKg / 0.5) - 1) * 22;
  const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

  const services = [
    { serviceId: 'STD', name: 'Amazon Shipping · Standard', rate: round2(base), etd: day(4), estimatedDays: 4, cod },
    { serviceId: 'EXP', name: 'Amazon Shipping · Expedited', rate: round2(base + 15), etd: day(3), estimatedDays: 3, cod },
    { serviceId: 'PRI', name: 'Amazon Shipping · Priority', rate: round2(base + 48), etd: day(2), estimatedDays: 2, cod: false },
  ]
    .filter((s) => (cod ? s.cod : true))
    .map((s) => ({ ...s, carrierId: 'AMZN_IN', carrierName: 'Amazon Shipping', serviceName: s.name.split('· ')[1] }));

  return { serviceable: true, services, recommended: services[0].serviceId, mock: true };
}

async function mockPurchase(order, serviceId) {
  const seed = Math.abs([...order.orderNumber].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const service = mockServiceability(order.shipPincode, 0.5, order.paymentMethod === 'COD').services;
  const chosen = service.find((s) => s.serviceId === serviceId) ?? service[0];

  return {
    carrierShipmentId: `AMZS${700000000 + (seed % 99999)}`,
    carrierServiceId: chosen?.serviceId ?? 'STD',
    carrierId: 'AMZN_IN',
    awbCode: `MOCK${String(seed).padStart(8, '0').slice(-8)}`,
    courierName: chosen?.name ?? 'Amazon Shipping · Standard',
    freightCharge: chosen?.rate ?? 59,
    etd: chosen?.etd ?? null,
    labelUrl: await saveLabel(order.orderNumber, mockLabelDocument()),
    mock: true,
  };
}

function mockTracking(awb) {
  const now = Date.now();
  const at = (h) => new Date(now - h * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  return {
    status: 'In Transit',
    awb,
    courier: 'Amazon Shipping',
    trackUrl: `https://track.amazon.in/tracking/${awb}`,
    edd: new Date(now + 2 * 86400_000).toISOString().slice(0, 10),
    mock: true,
    activities: [
      { date: at(2), status: 'Departed', activity: 'Departed Amazon facility', location: 'Bengaluru, Karnataka' },
      { date: at(14), status: 'PickupDone', activity: 'Picked up by Amazon Shipping', location: 'Chennai, Tamil Nadu' },
      { date: at(20), status: 'CreationConfirmed', activity: 'Shipment created', location: 'Chennai, Tamil Nadu' },
    ],
  };
}
