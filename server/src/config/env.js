import 'dotenv/config';

const bool = (v, d = false) => (v == null ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const INSECURE_ADMIN_PASSWORDS = new Set(['Admin@12345', 'admin', 'password', 'changeme']);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 4000),
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim(),
  // CLIENT_URL takes a comma-separated list, so the API can serve a GitHub Pages
  // site and a custom domain at the same time.
  clientOrigins: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  serverUrl: process.env.SERVER_URL || `http://localhost:${num(process.env.PORT, 4000)}`,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtlDays: num(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@kupaahealth.com',
    name: process.env.ADMIN_NAME || 'Kupaa Admin',
    // No password fallback here on purpose — the seed script owns that, and a
    // hardcoded default would be a known-good admin login on every deployment.
  },

  store: {
    name: process.env.STORE_NAME || 'Kupaa Health Products',
    email: process.env.STORE_EMAIL || 'support@kupaahealth.com',
    currency: process.env.CURRENCY || 'INR',
    taxPercent: num(process.env.TAX_PERCENT, 0),
    freeShippingAbove: num(process.env.FREE_SHIPPING_ABOVE, 999),
    flatShippingFee: num(process.env.FLAT_SHIPPING_FEE, 59),
    codEnabled: bool(process.env.COD_ENABLED, true),
    codExtraFee: num(process.env.COD_EXTRA_FEE, 0),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    get enabled() {
      return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    },
  },

  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL || '',
    password: process.env.SHIPROCKET_PASSWORD || '',
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE || '600001',
    webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN || '',
    baseUrl: 'https://apiv2.shiprocket.in/v1/external',
    get enabled() {
      return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
    },
  },

  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 5) * 1024 * 1024,
};

/** Warn loudly rather than crash — the store still runs in catalogue-only mode. */
export function reportConfig(log = console) {
  if (env.isProd) {
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!process.env[k] || process.env[k].startsWith('replace_me')) {
        throw new Error(`${k} must be set to a strong random value in production`);
      }
    }
  }
  if (process.env.ADMIN_PASSWORD && INSECURE_ADMIN_PASSWORDS.has(process.env.ADMIN_PASSWORD)) {
    const message = '[config] ADMIN_PASSWORD is a well-known default — anyone reading this repo can sign in as admin.';
    if (env.isProd) throw new Error(message);
    log.warn?.(`${message} Fine for local development; change it before deploying.`);
  }

  if (!env.razorpay.enabled) log.warn?.('[config] Razorpay keys missing — online payments disabled, COD only.');
  if (!env.shiprocket.enabled) log.warn?.('[config] Shiprocket credentials missing — shipping runs in mock mode.');
}
