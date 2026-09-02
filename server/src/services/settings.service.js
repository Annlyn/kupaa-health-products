import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Everything the storefront shows that is not a product, category or coupon
 * lives here: commerce rules, the announcement bar, home page copy, footer
 * details and the policy pages.
 *
 * Values are persisted as JSON strings in the `Setting` table and read through
 * an in-memory cache. `.env` supplies the initial defaults, so an untouched
 * install behaves exactly as before and the admin can override anything.
 */

const groups = {
  identity: 'Store identity',
  commerce: 'Pricing & delivery rules',
  notifications: 'WhatsApp notifications',
  announcement: 'Announcement bar',
  home: 'Home page',
  footer: 'Footer & contact',
  policies: 'Policy pages',
};

/** type: string | text | number | boolean | list — `list` is an array of objects. */
export const SETTINGS_SCHEMA = {
  // ------------------------------------------------------------- identity
  storeName: { group: 'identity', type: 'string', label: 'Store name', max: 80, default: () => env.store.name },
  storeTagline: {
    group: 'identity',
    type: 'string',
    label: 'Tagline',
    max: 120,
    default: () => 'Everyday wellness, honestly made',
  },
  supportEmail: { group: 'identity', type: 'string', label: 'Support email', max: 120, default: () => env.store.email },
  supportPhone: { group: 'identity', type: 'string', label: 'Support phone', max: 40, default: () => '+91 98765 43210' },
  currency: { group: 'identity', type: 'string', label: 'Currency code', max: 8, default: () => env.store.currency },

  // ------------------------------------------------------------- commerce
  freeShippingAbove: {
    group: 'commerce',
    type: 'number',
    label: 'Free delivery above (₹)',
    min: 0,
    hint: 'Set to 0 to charge shipping on every order',
    default: () => env.store.freeShippingAbove,
  },
  flatShippingFee: { group: 'commerce', type: 'number', label: 'Flat delivery fee (₹)', min: 0, default: () => env.store.flatShippingFee },
  taxPercent: { group: 'commerce', type: 'number', label: 'Tax percent', min: 0, max: 100, default: () => env.store.taxPercent },
  codEnabled: { group: 'commerce', type: 'boolean', label: 'Offer cash on delivery', default: () => env.store.codEnabled },
  codExtraFee: { group: 'commerce', type: 'number', label: 'COD handling fee (₹)', min: 0, default: () => env.store.codExtraFee },
  maxQtyPerItem: {
    group: 'commerce',
    type: 'number',
    label: 'Max quantity per item',
    min: 1,
    max: 50,
    hint: 'Upper limit a single cart line may reach',
    default: () => 20,
  },

  // -------------------------------------------------------- notifications
  whatsappNotifyOwner: {
    group: 'notifications',
    type: 'boolean',
    label: 'WhatsApp me when an order is placed',
    hint: 'Goes to WHATSAPP_OWNER_NUMBER in server/.env, along with a follow-up when an online payment lands',
    default: () => true,
  },
  whatsappSendInvoice: {
    group: 'notifications',
    type: 'boolean',
    label: 'WhatsApp the invoice to the customer once they pay online',
    hint: 'Cash-on-delivery orders are invoiced on delivery, so nothing is sent for them',
    default: () => true,
  },

  // --------------------------------------------------------- announcement
  announcementEnabled: { group: 'announcement', type: 'boolean', label: 'Show the announcement bar', default: () => true },
  announcementText: {
    group: 'announcement',
    type: 'string',
    label: 'Announcement text',
    max: 200,
    default: () => 'Lab-tested formulas · Ships across India',
  },

  // ------------------------------------------------------------------ home
  heroBadge: { group: 'home', type: 'string', label: 'Hero badge', max: 80, default: () => 'Trusted by 40,000+ Indian households' },
  heroTitle: { group: 'home', type: 'string', label: 'Hero headline', max: 80, default: () => 'Everyday wellness,' },
  heroTitleAccent: { group: 'home', type: 'string', label: 'Hero headline (accent line)', max: 80, default: () => 'honestly made.' },
  heroSubtitle: {
    group: 'home',
    type: 'text',
    label: 'Hero paragraph',
    max: 400,
    default: () =>
      'Lab-tested vitamins, standardised ayurvedic extracts, clean protein and home health devices — at doses that actually do something. No proprietary blends, no filler.',
  },
  heroPrimaryLabel: { group: 'home', type: 'string', label: 'Primary button label', max: 40, default: () => 'Shop all products' },
  heroPrimaryHref: { group: 'home', type: 'string', label: 'Primary button link', max: 200, default: () => '/shop' },
  heroSecondaryLabel: { group: 'home', type: 'string', label: 'Secondary button label', max: 40, default: () => 'Explore Ayurveda' },
  heroSecondaryHref: { group: 'home', type: 'string', label: 'Secondary button link', max: 200, default: () => '/shop?category=ayurveda-herbs' },
  heroStats: {
    group: 'home',
    type: 'list',
    label: 'Hero stats',
    fields: [
      { key: 'value', label: 'Value', max: 24 },
      { key: 'label', label: 'Caption', max: 40 },
    ],
    max: 4,
    default: () => [
      { value: '4.8★', label: 'Average rating' },
      { value: '24 hrs', label: 'Dispatch time' },
      { value: '₹999', label: 'Free delivery over' },
    ],
  },
  heroCards: {
    group: 'home',
    type: 'list',
    label: 'Hero highlight cards',
    fields: [
      { key: 'title', label: 'Title', max: 40 },
      { key: 'subtitle', label: 'Subtitle', max: 60 },
    ],
    max: 4,
    default: () => [
      { title: 'Vitamin D3 + K2', subtitle: 'Bones & immunity' },
      { title: 'KSM-66 Ashwagandha', subtitle: 'Stress & sleep' },
      { title: 'Whey Isolate', subtitle: '27g protein / scoop' },
      { title: 'Omega-3 Triple', subtitle: 'Heart & brain' },
    ],
  },
  trustItems: {
    group: 'home',
    type: 'list',
    label: 'Trust strip',
    fields: [
      { key: 'title', label: 'Title', max: 50 },
      { key: 'copy', label: 'Description', max: 120 },
    ],
    max: 4,
    default: () => [
      { title: 'Third-party tested', copy: 'Every batch assayed for potency, purity and heavy metals.' },
      { title: 'Clinically dosed', copy: 'The amounts used in studies — not fairy-dusted labels.' },
      { title: 'Fast, tracked delivery', copy: 'Dispatched in 24 hours with live Amazon Shipping tracking.' },
      { title: 'Easy 7-day returns', copy: 'Unopened packs, no questions asked.' },
    ],
  },
  categoriesTitle: { group: 'home', type: 'string', label: 'Category section title', max: 60, default: () => 'Shop by goal' },
  categoriesSubtitle: {
    group: 'home',
    type: 'string',
    label: 'Category section subtitle',
    max: 160,
    default: () => 'Six focused ranges, each built around what you are actually trying to fix.',
  },
  featuredTitle: { group: 'home', type: 'string', label: 'Bestsellers title', max: 60, default: () => 'Bestsellers' },
  featuredSubtitle: {
    group: 'home',
    type: 'string',
    label: 'Bestsellers subtitle',
    max: 160,
    default: () => 'What our customers reorder, month after month.',
  },
  newestTitle: { group: 'home', type: 'string', label: 'New arrivals title', max: 60, default: () => 'New in store' },
  newestSubtitle: {
    group: 'home',
    type: 'string',
    label: 'New arrivals subtitle',
    max: 160,
    default: () => 'Freshly added to the Kupaa range.',
  },
  promoEnabled: { group: 'home', type: 'boolean', label: 'Show the closing promo panel', default: () => true },
  promoTitle: { group: 'home', type: 'string', label: 'Promo title', max: 80, default: () => 'Not sure where to start?' },
  promoBody: {
    group: 'home',
    type: 'text',
    label: 'Promo paragraph',
    max: 400,
    default: () =>
      'Most people benefit from three things: vitamin D, omega-3 and magnesium. Start there, stay consistent for eight weeks, then build on it.',
  },
  promoBullets: {
    group: 'home',
    type: 'list',
    label: 'Promo bullets',
    fields: [{ key: 'text', label: 'Bullet', max: 60 }],
    max: 5,
    default: () => [{ text: 'Vitamin D3 + K2' }, { text: 'Omega-3 Triple Strength' }, { text: 'Magnesium Glycinate' }],
  },
  promoCtaLabel: { group: 'home', type: 'string', label: 'Promo button label', max: 40, default: () => 'Build your daily stack' },
  promoCtaHref: { group: 'home', type: 'string', label: 'Promo button link', max: 200, default: () => '/shop?category=vitamins-supplements' },

  // ---------------------------------------------------------------- footer
  footerBlurb: {
    group: 'footer',
    type: 'text',
    label: 'Footer blurb',
    max: 400,
    default: () =>
      'Everyday wellness, honestly made. Clinically dosed supplements and home health essentials, shipped across India.',
  },
  footerPromises: {
    group: 'footer',
    type: 'list',
    label: 'Footer promise strip',
    fields: [
      { key: 'title', label: 'Title', max: 50 },
      { key: 'copy', label: 'Description', max: 120 },
    ],
    max: 3,
    default: () => [
      {
        "title": "Lab-tested, every batch",
        "copy": "Third-party assays for potency and heavy metals."
      },
      {
        "title": "Fast, tracked delivery",
        "copy": "Dispatched within 24 hours, tracked end to end."
      },
      {
        "title": "Easy 7-day returns",
        "copy": "Unopened packs, no questions asked."
      }
    ],
  },
  footerNote: {
    group: 'footer',
    type: 'string',
    label: 'Footer fine print',
    max: 200,
    default: () => 'These statements are not medical advice.',
  },

  // -------------------------------------------------------------- policies
  policyShipping: {
    group: 'policies',
    type: 'text',
    label: 'Shipping & delivery',
    max: 6000,
    hint: 'One paragraph per line. Blank lines are ignored.',
    default: () =>
      [
        'Orders placed before 2 PM IST on a working day are dispatched the same day; everything else goes out the next working day.',
        'Delivery typically takes 2–5 working days in metros and 4–8 days elsewhere. Remote PIN codes may take longer.',
        'Delivery is free on orders above ₹999. Below that a flat ₹59 shipping fee applies.',
        'Every parcel ships with an Amazon Shipping tracking number, sent by email at dispatch and visible under My Orders.',
        'If a courier attempts delivery three times without success, the parcel is returned to us and we refund the order minus shipping.',
      ].join('\n'),
  },
  policyReturns: {
    group: 'policies',
    type: 'text',
    label: 'Returns & refunds',
    max: 6000,
    default: () =>
      [
        'Unopened, unused products in their original packaging can be returned within 7 days of delivery.',
        'For hygiene and safety reasons we cannot accept returns of opened supplements, powders or personal care items unless the product is damaged or expired.',
        'If a product arrives damaged, defective or incorrect, email us within 48 hours with photographs and your order number. We arrange a free pickup and send a replacement or a full refund.',
        'Approved refunds are issued to the original payment method within 5–7 working days of us receiving the return. Cash-on-delivery refunds go to a bank account you nominate.',
        'Orders can be cancelled free of charge any time before dispatch, from My Orders.',
      ].join('\n'),
  },
  policyPrivacy: {
    group: 'policies',
    type: 'text',
    label: 'Privacy policy',
    max: 6000,
    default: () =>
      [
        'We collect only what we need to fulfil your order: your name, email, phone number and delivery address.',
        'Payment details are never stored on our servers. Card, UPI and netbanking data goes directly to Razorpay, a PCI-DSS Level 1 certified payment processor.',
        'Delivery details are shared with Amazon Shipping purely so they can deliver your parcel.',
        'Passwords are stored as bcrypt hashes and are never recoverable in plain text, by us or anyone else.',
        'You can request a copy of your data, or ask us to delete your account entirely, by writing to our support address.',
      ].join('\n'),
  },
  policyTerms: {
    group: 'policies',
    type: 'text',
    label: 'Terms of service',
    max: 6000,
    default: () =>
      [
        'Prices are in Indian Rupees and inclusive of applicable taxes. We may revise prices at any time; the price shown at checkout is what you pay.',
        'Orders are subject to stock availability. If an item goes out of stock after you order, we cancel that line and refund it in full.',
        'Products sold here are food supplements and wellness devices. They are not intended to diagnose, treat, cure or prevent any disease.',
        'Consult a qualified physician before starting any supplement, particularly if you are pregnant, nursing, on prescription medication or managing a chronic condition.',
        'All content, imagery and branding on this store is our property.',
      ].join('\n'),
  },
  policyContact: {
    group: 'policies',
    type: 'text',
    label: 'Contact us',
    max: 6000,
    default: () =>
      [
        'Email us and we reply within one working day.',
        'Phone lines are open Monday to Saturday, 9 AM to 7 PM IST.',
        'Registered office: 4th Floor, Wellness House, Anna Salai, Chennai, Tamil Nadu 600002.',
        'For order-specific questions, please quote your order number (it looks like KUP-260830-482913).',
      ].join('\n'),
  },
};

export const SETTINGS_GROUPS = Object.entries(groups).map(([key, label]) => ({
  key,
  label,
  keys: Object.keys(SETTINGS_SCHEMA).filter((k) => SETTINGS_SCHEMA[k].group === key),
}));

let cache = null;

const defaults = () =>
  Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, spec]) => [key, spec.default()]));

/** Reads every setting, merging DB overrides on top of the env-backed defaults. */
export async function getSettings() {
  if (cache) return cache;

  const rows = await prisma.setting.findMany();
  const merged = defaults();

  for (const row of rows) {
    if (!SETTINGS_SCHEMA[row.key]) continue; // stale key from an older schema
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      // ignore a corrupt row rather than breaking the whole storefront
    }
  }

  cache = merged;
  return cache;
}

export const invalidateSettings = () => {
  cache = null;
};

function coerce(key, raw) {
  const spec = SETTINGS_SCHEMA[key];
  const fail = (message) => {
    throw ApiError.badRequest(`${spec.label}: ${message}`);
  };

  switch (spec.type) {
    case 'boolean':
      return Boolean(raw);

    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) fail('must be a number');
      if (spec.min != null && n < spec.min) fail(`cannot be below ${spec.min}`);
      if (spec.max != null && n > spec.max) fail(`cannot be above ${spec.max}`);
      return n;
    }

    case 'list': {
      if (!Array.isArray(raw)) fail('must be a list');
      if (spec.max && raw.length > spec.max) fail(`allows at most ${spec.max} entries`);
      return raw.map((entry) =>
        Object.fromEntries(
          spec.fields.map((field) => [field.key, String(entry?.[field.key] ?? '').trim().slice(0, field.max ?? 200)]),
        ),
      );
    }

    default: {
      const s = String(raw ?? '').trim();
      if (spec.max && s.length > spec.max) fail(`is limited to ${spec.max} characters`);
      if (spec.required !== false && spec.type === 'string' && !s) fail('cannot be empty');
      return s;
    }
  }
}

/** Validates and persists a partial settings patch, then clears the cache. */
export async function updateSettings(patch) {
  const writes = [];

  for (const [key, raw] of Object.entries(patch)) {
    if (!SETTINGS_SCHEMA[key]) continue; // silently drop unknown keys
    const value = coerce(key, raw);
    writes.push(
      prisma.setting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value) },
        update: { value: JSON.stringify(value) },
      }),
    );
  }

  if (!writes.length) throw ApiError.badRequest('No recognised settings were supplied');

  await prisma.$transaction(writes);
  invalidateSettings();
  return getSettings();
}

/** Drops overrides for the given keys (or every key) so defaults apply again. */
export async function resetSettings(keys) {
  await prisma.setting.deleteMany(keys?.length ? { where: { key: { in: keys } } } : {});
  invalidateSettings();
  return getSettings();
}
