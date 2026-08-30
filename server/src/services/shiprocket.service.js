import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { round2 } from '../utils/money.js';

/**
 * Thin Shiprocket API v1 client.
 *
 * Auth: /auth/login returns a bearer token valid for ~10 days. We cache it in
 * memory and refresh on expiry or on the first 401 from any call.
 *
 * When credentials are absent the module runs in MOCK mode so the whole
 * checkout flow stays testable locally.
 */

const BASE = env.shiprocket.baseUrl;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // refresh a day before Shiprocket expires it

let cached = { token: null, fetchedAt: 0 };

export const shiprocketEnabled = () => env.shiprocket.enabled;
export const isMock = () => !env.shiprocket.enabled;

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    logger.error('[shiprocket] login failed', res.status, data);
    throw ApiError.upstream('Could not authenticate with Shiprocket', data?.message);
  }
  cached = { token: data.token, fetchedAt: Date.now() };
  logger.info('[shiprocket] authenticated');
  return cached.token;
}

async function getToken(force = false) {
  if (!env.shiprocket.enabled) throw ApiError.badRequest('Shiprocket is not configured');
  if (force || !cached.token || Date.now() - cached.fetchedAt > TOKEN_TTL_MS) return login();
  return cached.token;
}

async function call(path, { method = 'GET', body, query, retry = true } = {}) {
  const token = await getToken();
  const url = new URL(`${BASE}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    await getToken(true);
    return call(path, { method, body, query, retry: false });
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    logger.error('[shiprocket]', method, path, res.status, data);
    const message = data?.message || data?.errors ? JSON.stringify(data.message || data.errors) : 'Shiprocket request failed';
    throw ApiError.upstream(`Shiprocket: ${message}`, data);
  }
  return data;
}

// ------------------------------------------------------------------ read APIs

/** Courier options + rates between the pickup pincode and a delivery pincode. */
export async function checkServiceability({ deliveryPincode, weightKg = 0.5, cod = false, declaredValue = 0 }) {
  if (isMock()) return mockServiceability(deliveryPincode, weightKg, cod);

  const data = await call('/courier/serviceability/', {
    query: {
      pickup_postcode: env.shiprocket.pickupPincode,
      delivery_postcode: deliveryPincode,
      weight: Math.max(0.05, weightKg),
      cod: cod ? 1 : 0,
      declared_value: declaredValue,
    },
  });

  const couriers = data?.data?.available_courier_companies || [];
  return {
    serviceable: couriers.length > 0,
    couriers: couriers
      .map((c) => ({
        courierCompanyId: c.courier_company_id,
        name: c.courier_name,
        rate: round2(c.rate),
        etd: c.etd,
        estimatedDays: c.estimated_delivery_days,
        rating: c.rating,
        cod: Boolean(c.cod),
      }))
      .sort((a, b) => a.rate - b.rate),
    recommended: data?.data?.recommended_courier_company_id ?? null,
  };
}

export async function getPickupLocations() {
  if (isMock()) return [{ pickup_location: env.shiprocket.pickupLocation, city: 'Chennai', pin_code: env.shiprocket.pickupPincode }];
  const data = await call('/settings/company/pickup');
  return data?.data?.shipping_address || [];
}

export async function trackByAwb(awb) {
  if (isMock()) return mockTracking(awb);
  const data = await call(`/courier/track/awb/${encodeURIComponent(awb)}`);
  const payload = Array.isArray(data) ? data[0] : data;
  const t = payload?.tracking_data || payload;
  return {
    status: t?.shipment_track?.[0]?.current_status || t?.track_status || 'In Transit',
    awb,
    courier: t?.shipment_track?.[0]?.courier_name || null,
    trackUrl: t?.track_url || null,
    edd: t?.shipment_track?.[0]?.edd || null,
    activities: (t?.shipment_track_activities || []).map((a) => ({
      date: a.date,
      status: a.status,
      activity: a.activity,
      location: a.location,
    })),
  };
}

// ----------------------------------------------------------------- write APIs

/** Maps one of our Orders into a Shiprocket "adhoc" order payload. */
export function buildOrderPayload(order) {
  return {
    order_id: order.orderNumber,
    order_date: new Date(order.placedAt).toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: env.shiprocket.pickupLocation,
    channel_id: '',
    comment: order.notes || '',

    billing_customer_name: order.shipName.split(' ')[0],
    billing_last_name: order.shipName.split(' ').slice(1).join(' ') || '.',
    billing_address: order.shipLine1,
    billing_address_2: order.shipLine2 || '',
    billing_city: order.shipCity,
    billing_pincode: order.shipPincode,
    billing_state: order.shipState,
    billing_country: order.shipCountry || 'India',
    billing_email: order.shipEmail,
    billing_phone: order.shipPhone,
    shipping_is_billing: true,

    order_items: order.items.map((i) => ({
      // The packer needs to see the size on the label, not just the product.
      name: i.variantName ? `${i.name} (${i.variantName})` : i.name,
      sku: i.sku,
      units: i.quantity,
      selling_price: round2(i.price),
      discount: 0,
      tax: '',
      hsn: '',
    })),

    payment_method: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    shipping_charges: round2(order.shippingFee),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: round2(order.discount),
    sub_total: round2(order.subtotal),

    // Shiprocket wants the packed parcel, not per-item dimensions
    length: Math.max(10, Math.ceil(Math.max(...order.items.map(() => 15)))),
    breadth: 12,
    height: Math.max(5, Math.ceil(order.items.reduce((h, i) => h + i.quantity * 2, 3))),
    weight: Math.max(0.05, round2(order.items.reduce((w, i) => w + (i.weightKg || 0.3) * i.quantity, 0))),
  };
}

export async function createShiprocketOrder(order) {
  if (isMock()) return mockCreateOrder(order);
  const data = await call('/orders/create/adhoc', { method: 'POST', body: buildOrderPayload(order) });
  return {
    shiprocketOrderId: String(data.order_id ?? ''),
    shiprocketShipmentId: String(data.shipment_id ?? ''),
    status: data.status || 'NEW',
  };
}

export async function assignAwb({ shipmentId, courierCompanyId }) {
  if (isMock()) return mockAssignAwb(shipmentId);
  const data = await call('/courier/assign/awb', {
    method: 'POST',
    body: { shipment_id: Number(shipmentId), ...(courierCompanyId ? { courier_id: Number(courierCompanyId) } : {}) },
  });
  const d = data?.response?.data || data?.data || {};
  if (!d.awb_code) throw ApiError.upstream('Shiprocket did not return an AWB', data);
  return {
    awbCode: String(d.awb_code),
    courierName: d.courier_name || null,
    courierCompanyId: d.courier_company_id ?? null,
    freightCharge: d.freight_charges != null ? round2(d.freight_charges) : null,
  };
}

export async function requestPickup(shipmentId) {
  if (isMock()) return { scheduled: true, pickupDate: new Date().toISOString().slice(0, 10) };
  const data = await call('/courier/generate/pickup', { method: 'POST', body: { shipment_id: [Number(shipmentId)] } });
  return { scheduled: true, pickupDate: data?.response?.pickup_scheduled_date || null, raw: data };
}

export async function generateLabel(shipmentId) {
  if (isMock()) return { labelUrl: `https://example.invalid/mock-label-${shipmentId}.pdf` };
  const data = await call('/courier/generate/label', { method: 'POST', body: { shipment_id: [Number(shipmentId)] } });
  return { labelUrl: data?.label_url || null };
}

export async function generateManifest(shipmentId) {
  if (isMock()) return { manifestUrl: `https://example.invalid/mock-manifest-${shipmentId}.pdf` };
  const data = await call('/manifests/generate', { method: 'POST', body: { shipment_id: [Number(shipmentId)] } });
  return { manifestUrl: data?.manifest_url || null };
}

export async function generateInvoice(shiprocketOrderId) {
  if (isMock()) return { invoiceUrl: `https://example.invalid/mock-invoice-${shiprocketOrderId}.pdf` };
  const data = await call('/orders/print/invoice', { method: 'POST', body: { ids: [Number(shiprocketOrderId)] } });
  return { invoiceUrl: data?.invoice_url || null };
}

export async function cancelShipment(shiprocketOrderId) {
  if (isMock()) return { cancelled: true };
  await call('/orders/cancel', { method: 'POST', body: { ids: [Number(shiprocketOrderId)] } });
  return { cancelled: true };
}

// ---------------------------------------------------------------- mock mode
// Deterministic fake responses so checkout, the admin console and the tracking
// page all work end-to-end before real Shiprocket credentials exist.

const nonServiceable = new Set(['000000', '111111']);

function mockServiceability(pincode, weightKg, cod) {
  if (!/^\d{6}$/.test(String(pincode)) || nonServiceable.has(String(pincode))) {
    return { serviceable: false, couriers: [], recommended: null, mock: true };
  }
  const base = 45 + Math.max(0, Math.ceil(weightKg / 0.5) - 1) * 22;
  const couriers = [
    { courierCompanyId: 51, name: 'Delhivery Surface', rate: round2(base), etd: '3-4 days', estimatedDays: 4, rating: 4.4, cod },
    { courierCompanyId: 24, name: 'Xpressbees', rate: round2(base + 15), etd: '2-3 days', estimatedDays: 3, rating: 4.2, cod },
    { courierCompanyId: 12, name: 'Bluedart Air', rate: round2(base + 48), etd: '1-2 days', estimatedDays: 2, rating: 4.7, cod: false },
  ].filter((c) => (cod ? c.cod : true));
  return { serviceable: true, couriers, recommended: couriers[0].courierCompanyId, mock: true };
}

function mockCreateOrder(order) {
  const seed = Math.abs([...order.orderNumber].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  return { shiprocketOrderId: String(700000000 + (seed % 99999)), shiprocketShipmentId: String(800000000 + (seed % 99999)), status: 'NEW', mock: true };
}

function mockAssignAwb(shipmentId) {
  return {
    awbCode: `MOCK${String(shipmentId).slice(-8)}`,
    courierName: 'Delhivery Surface',
    courierCompanyId: 51,
    freightCharge: 59,
    mock: true,
  };
}

function mockTracking(awb) {
  const now = Date.now();
  const at = (h) => new Date(now - h * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  return {
    status: 'In Transit',
    awb,
    courier: 'Delhivery Surface',
    trackUrl: `https://shiprocket.co/tracking/${awb}`,
    edd: new Date(now + 2 * 86400_000).toISOString().slice(0, 10),
    mock: true,
    activities: [
      { date: at(2), status: 'IT', activity: 'Shipment in transit', location: 'Bengaluru Hub' },
      { date: at(14), status: 'PKD', activity: 'Picked up by courier', location: 'Chennai Warehouse' },
      { date: at(20), status: 'MNF', activity: 'Shipment manifested', location: 'Chennai Warehouse' },
    ],
  };
}
