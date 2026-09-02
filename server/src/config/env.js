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
    // Long, and rotated on every refresh — a signed-in browser stays signed in.
    refreshTtlDays: num(process.env.REFRESH_TOKEN_TTL_DAYS, 180),
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
    // Free delivery is opt-in: an admin (or deployment) must set a positive
    // threshold before orders qualify for it.
    freeShippingAbove: num(process.env.FREE_SHIPPING_ABOVE, 0),
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

  /**
   * Amazon Shipping runs on SP-API, so the credentials are a Login with Amazon
   * application (client id + secret) plus the refresh token issued when the
   * seller authorises it. India sits in the SP-API "eu" region.
   */
  amazon: {
    clientId: process.env.AMAZON_LWA_CLIENT_ID || '',
    clientSecret: process.env.AMAZON_LWA_CLIENT_SECRET || '',
    refreshToken: process.env.AMAZON_LWA_REFRESH_TOKEN || '',
    endpoint: (process.env.AMAZON_SPAPI_ENDPOINT || 'https://sellingpartnerapi-eu.amazon.com').replace(/\/$/, ''),
    carrierId: process.env.AMAZON_CARRIER_ID || 'AMZN_IN',
    // Relayed SP-API notifications hit /api/shipping/webhook with this secret
    // in the x-api-key header.
    webhookToken: process.env.SHIPPING_WEBHOOK_TOKEN || '',

    // Rate quotes need a full origin address, not just a PIN code.
    shipFrom: {
      name: process.env.AMAZON_SHIP_FROM_NAME || process.env.STORE_NAME || 'Kupaa Health Products',
      line1: process.env.AMAZON_SHIP_FROM_LINE1 || '4th Floor, Wellness House, Anna Salai',
      line2: process.env.AMAZON_SHIP_FROM_LINE2 || '',
      city: process.env.AMAZON_SHIP_FROM_CITY || 'Chennai',
      state: process.env.AMAZON_SHIP_FROM_STATE || 'Tamil Nadu',
      pincode: process.env.AMAZON_SHIP_FROM_PINCODE || '600002',
      country: process.env.AMAZON_SHIP_FROM_COUNTRY || 'IN',
      phone: process.env.AMAZON_SHIP_FROM_PHONE || '9876543210',
      email: process.env.AMAZON_SHIP_FROM_EMAIL || process.env.STORE_EMAIL || '',
    },

    get enabled() {
      return Boolean(
        process.env.AMAZON_LWA_CLIENT_ID && process.env.AMAZON_LWA_CLIENT_SECRET && process.env.AMAZON_LWA_REFRESH_TOKEN,
      );
    },
  },

  /**
   * WhatsApp Cloud API (Meta Graph). The access token and phone number id come
   * from the WhatsApp app in Meta for Developers; `ownerNumber` is where new
   * order alerts go.
   *
   * Meta only allows free-form text inside a 24-hour window opened by the
   * customer, so business-initiated messages need approved templates. Name the
   * templates here and they are used; leave one blank and that message falls
   * back to plain text, which is enough for test numbers and local work.
   */
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    ownerNumber: process.env.WHATSAPP_OWNER_NUMBER || '',
    // Customers type 10-digit numbers; E.164 needs a country code in front.
    defaultCountryCode: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
    templates: {
      newOrder: process.env.WHATSAPP_TEMPLATE_NEW_ORDER || '',
      paymentReceived: process.env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED || '',
      invoice: process.env.WHATSAPP_TEMPLATE_INVOICE || '',
    },
    get enabled() {
      return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
    },
  },

  /**
   * Sign-in verification. The identifier (email or phone) is confirmed with a
   * one-time code before the password is asked for, and the browser is then
   * remembered so it only happens once.
   *
   * LOGIN_OTP_ENABLED=false is the escape hatch: it turns the step off without
   * a code change, which matters because a store whose delivery channels are
   * misconfigured would otherwise have no way in.
   */
  auth: {
    otpEnabled: bool(process.env.LOGIN_OTP_ENABLED, true),
    otpTtlMinutes: num(process.env.LOGIN_OTP_TTL_MINUTES, 10),
    otpMaxAttempts: num(process.env.LOGIN_OTP_MAX_ATTEMPTS, 5),
    trustedDeviceDays: num(process.env.TRUSTED_DEVICE_DAYS, 180),
  },

  /** SMTP for one-time codes sent to an email address. */
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.STORE_EMAIL || 'support@kupaahealth.com',
    get enabled() {
      return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    },
  },

  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 5) * 1024 * 1024,

  /**
   * Where product images are written. Defaults to ./uploads for local dev.
   *
   * On a host with an ephemeral filesystem this MUST point at a mounted disk,
   * or every image disappears on the next deploy. See the `disk` block in
   * render.yaml, which mounts one and sets UPLOAD_DIR to it.
   */
  uploadDir: process.env.UPLOAD_DIR || 'uploads',

  /**
   * SQLite locally, Postgres in production. Prisma needs the provider as a
   * literal in the schema (scripts/set-db-provider.js keeps it in step), but a
   * few queries have to know too: `contains` is case-insensitive on SQLite and
   * case-sensitive on Postgres unless asked otherwise. See lib/search.js.
   */
  isPostgres: /^postgres(ql)?:/.test(process.env.DATABASE_URL || ''),
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
  if (!env.amazon.enabled) log.warn?.('[config] Amazon Shipping credentials missing — shipping runs in mock mode.');
  if (!env.whatsapp.enabled) log.warn?.('[config] WhatsApp credentials missing — order alerts and invoices are logged, not sent.');
  if (env.auth.otpEnabled && !env.whatsapp.enabled && !env.smtp.enabled) {
    log.warn?.(
      '[config] Sign-in OTP is on but neither WhatsApp nor SMTP is configured — codes are printed to this log only.' +
        (env.isProd ? ' Set SMTP_* / WHATSAPP_* or LOGIN_OTP_ENABLED=false before anyone tries to sign in.' : ''),
    );
  }
  else if (!env.whatsapp.ownerNumber) log.warn?.('[config] WHATSAPP_OWNER_NUMBER is not set — new order alerts have nowhere to go.');
}
