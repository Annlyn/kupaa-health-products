/**
 * Demo mode — the storefront running with no backend at all.
 *
 * GitHub Pages serves static files only: no Express, no database, no API. When
 * the build sets VITE_DEMO the client swaps `fetch` for `demoFetch`, which
 * answers the read-only catalogue endpoints out of the snapshot in data.json.
 *
 * The point is to mirror the server's responses closely enough that no page,
 * hook or context knows the difference — so the logic below is a deliberate
 * port of the controllers it stands in for. Anything that writes (sign-in,
 * checkout, admin) answers 503: there is genuinely nowhere to write.
 *
 * Nothing outside this folder depends on it. client/vite.config.js resolves
 * `virtual:demo` here when the folder exists and to an inert stub when it does
 * not, so deleting demo/ turns the whole feature off. See README.md.
 */

export const DEMO = import.meta.env.VITE_DEMO === 'true';

export const DEMO_NOTICE =
  'Demo mode: catalogue and cart are live, but accounts and checkout need the API server.';

const UNAVAILABLE = 'Not available in the demo — this needs the API server running.';

/** A separate chunk, so it is only downloaded when demo mode is actually on. */
let snapshot = null;
const load = () => (snapshot ??= import('./data.json').then((m) => m.default));

// --------------------------------------------------------------- money helpers
// Ported from server/src/utils/money.js.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sum = (arr, pick) => round2(arr.reduce((t, x) => t + Number(pick(x) || 0), 0));

// ------------------------------------------------------------- variant helpers
// Ported from server/src/services/variant.service.js.
const activeVariants = (product) =>
  (product.variants ?? [])
    .filter((v) => v.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);

function summarise(product) {
  const options = activeVariants(product);
  if (!options.length) {
    return { hasVariants: false, variantCount: 0, priceFrom: product.price, priceTo: product.price, stock: product.stock };
  }
  const prices = options.map((v) => v.price);
  return {
    hasVariants: true,
    variantCount: options.length,
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    stock: options.reduce((n, v) => n + v.stock, 0),
  };
}

const withVariantSummary = (product) => ({ ...product, ...summarise(product) });

class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function resolveSellable(product, variantId) {
  const options = activeVariants(product);

  if (!options.length) {
    if (variantId) throw new DemoError(400, `${product.name} does not come in multiple options`);
    return {
      variantId: null, variantName: null, sku: product.sku, price: product.price,
      mrp: product.mrp, stock: product.stock, weightKg: product.weightKg, label: product.name,
    };
  }
  if (!variantId) {
    throw new DemoError(400, `Choose a ${product.variantLabel?.toLowerCase() || 'option'} for ${product.name}`);
  }
  const variant = options.find((v) => v.id === variantId);
  if (!variant) throw new DemoError(400, `That option is no longer available for ${product.name}`);

  return {
    variantId: variant.id, variantName: variant.name, sku: variant.sku, price: variant.price,
    mrp: variant.mrp, stock: variant.stock, weightKg: variant.weightKg,
    label: `${product.name} — ${variant.name}`,
  };
}

/** Trimmed to the columns `productCard` selects, so list payloads match the API. */
const CARD_FIELDS = [
  'id', 'name', 'slug', 'sku', 'shortDesc', 'price', 'mrp', 'stock', 'isFeatured',
  'ratingAvg', 'ratingCount', 'tags', 'createdAt', 'variantLabel', 'category', 'images', 'variants',
];
const toCard = (product) => withVariantSummary(Object.fromEntries(CARD_FIELDS.map((k) => [k, product[k]])));

// ------------------------------------------------------------------ catalogue
const contains = (haystack, needle) => String(haystack ?? '').toLowerCase().includes(needle);

const SORTS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
  name: (a, b) => a.name.localeCompare(b.name),
};

function listProducts(data, params) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const category = params.get('category');
  const tag = (params.get('tag') || '').trim().toLowerCase();
  const minPrice = params.has('minPrice') ? Number(params.get('minPrice')) : null;
  const maxPrice = params.has('maxPrice') ? Number(params.get('maxPrice')) : null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(60, Math.max(1, Number(params.get('limit')) || 12));

  const items = data.products
    .filter((p) => {
      if (category && p.category?.slug !== category) return false;
      if (params.get('featured') === 'true' && !p.isFeatured) return false;
      if (params.get('inStock') === 'true' && !(p.stock > 0)) return false;
      if (minPrice != null && p.price < minPrice) return false;
      if (maxPrice != null && p.price > maxPrice) return false;
      if (tag && !contains(p.tags, tag)) return false;
      if (q && ![p.name, p.shortDesc, p.description, p.tags, p.sku].some((f) => contains(f, q))) return false;
      return true;
    })
    .sort(SORTS[params.get('sort')] ?? SORTS.newest);

  const total = items.length;
  return {
    data: items.slice((page - 1) * limit, page * limit).map(toCard),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function productDetail(data, slug) {
  const product = data.products.find((p) => p.slug === slug);
  if (!product) throw new DemoError(404, 'That product is no longer available');

  const related = data.products
    .filter((p) => p.id !== product.id && p.categoryId && p.categoryId === product.categoryId)
    .sort((a, b) => b.ratingAvg - a.ratingAvg)
    .slice(0, 4);

  return {
    ...withVariantSummary(product),
    reviews: product.reviews.slice(0, 20),
    ratingBreakdown: [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: product.reviews.filter((r) => r.rating === star).length,
    })),
    related: related.map(toCard),
  };
}

// -------------------------------------------------------------------- pricing
// Ported from server/src/services/pricing.service.js.
function resolveCoupon(data, code, subtotal) {
  if (!code) return { coupon: null, discount: 0 };

  const coupon = data.coupons.find((c) => c.code === String(code).trim().toUpperCase());
  const now = Date.now();

  if (!coupon) throw new DemoError(400, 'That coupon code is not valid');
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw new DemoError(400, 'That coupon is not active yet');
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) throw new DemoError(400, 'That coupon has expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new DemoError(400, 'That coupon has reached its usage limit');
  }
  if (subtotal < coupon.minOrder) {
    throw new DemoError(400, `Add items worth ₹${round2(coupon.minOrder - subtotal)} more to use ${coupon.code}`);
  }

  let discount = coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);

  return { coupon, discount: round2(Math.min(discount, subtotal)) };
}

function quote(data, { lines, couponCode, paymentMethod = 'RAZORPAY' }) {
  const s = data.settings;
  const subtotal = sum(lines, (l) => (l.unitPrice ?? l.product.price) * l.quantity);
  const { coupon, discount } = resolveCoupon(data, couponCode, subtotal);

  const afterDiscount = round2(subtotal - discount);
  const freeShipping = s.freeShippingAbove > 0 && afterDiscount >= s.freeShippingAbove;
  const shippingFee = round2((freeShipping ? 0 : s.flatShippingFee) + (paymentMethod === 'COD' ? s.codExtraFee : 0));
  const tax = round2((afterDiscount * s.taxPercent) / 100);

  return {
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    discount,
    couponCode: coupon?.code ?? null,
    shippingFee,
    tax,
    taxPercent: s.taxPercent,
    total: round2(afterDiscount + shippingFee + tax),
    currency: s.currency,
    freeShippingAbove: s.freeShippingAbove,
    amountToFreeShipping: s.freeShippingAbove > 0 ? Math.max(0, round2(s.freeShippingAbove - afterDiscount)) : 0,
  };
}

/** POST /cart/quote — prices the guest cart the browser keeps in localStorage. */
function guestQuote(data, body) {
  const { items = [], couponCode, paymentMethod = 'RAZORPAY' } = body || {};

  const lines = [];
  for (const item of items) {
    const product = data.products.find((p) => p.id === item.productId);
    if (!product) continue;
    try {
      const sellable = resolveSellable(product, item.variantId ?? null);
      lines.push({
        id: `${item.productId}:${item.variantId ?? ''}`,
        productId: item.productId,
        variantId: sellable.variantId,
        variantName: sellable.variantName,
        variantLabel: product.variantLabel,
        quantity: item.quantity,
        product: toCard(product),
        unitPrice: sellable.price,
        mrp: sellable.mrp,
        sku: sellable.sku,
        weightKg: sellable.weightKg,
        lineTotal: round2(sellable.price * item.quantity),
        inStock: sellable.stock >= item.quantity,
        maxQuantity: sellable.stock,
      });
    } catch {
      // A variant that no longer exists drops out of the quote, as on the server.
    }
  }

  let totals;
  let couponError = null;
  try {
    totals = quote(data, { lines, couponCode, paymentMethod });
  } catch (err) {
    // An invalid coupon must not break the cart page.
    couponError = err.message;
    totals = quote(data, { lines, paymentMethod });
  }
  return { items: lines, totals, couponError };
}

// -------------------------------------------------------------------- routing
/** `[method, pattern, handler]`. Handlers return the response `data`, or `{ data, meta }`. */
const ROUTES = [
  ['GET', /^\/health$/, () => ({ status: 'demo', service: 'Kupaa Health Products', time: new Date().toISOString() })],
  ['GET', /^\/store$/, (data) => data.settings],

  ['GET', /^\/categories$/, (data) => data.categories],
  ['GET', /^\/categories\/([^/]+)$/, (data, [slug]) => {
    const category = data.categories.find((c) => c.slug === slug);
    if (!category) throw new DemoError(404, 'Category not found');
    return {
      category,
      products: data.products.filter((p) => p.category?.slug === slug).slice(0, 24).map(toCard),
    };
  }],

  ['GET', /^\/products\/facets$/, (data) => {
    const prices = data.products.map((p) => p.price);
    return {
      priceMin: Math.floor(prices.length ? Math.min(...prices) : 0),
      priceMax: Math.ceil(prices.length ? Math.max(...prices) : 0),
      categories: data.categories.map(({ description, ...c }) => c),
    };
  }],

  ['GET', /^\/products\/suggest$/, (data, _p, params) => {
    const q = (params.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return [];
    return data.products
      .filter((p) => contains(p.name, q) || contains(p.tags, q))
      .slice(0, 6)
      .map((p) => ({ name: p.name, slug: p.slug, price: p.price, images: p.images.slice(0, 1) }));
  }],

  ['GET', /^\/products$/, (data, _p, params) => listProducts(data, params)],
  ['GET', /^\/products\/([^/]+)$/, (data, [slug]) => productDetail(data, slug)],
  ['GET', /^\/products\/([^/]+)\/reviews$/, (data, [slug]) => {
    const product = data.products.find((p) => p.slug === slug);
    if (!product) throw new DemoError(404, 'Product not found');
    return product.reviews;
  }],

  ['GET', /^\/payments\/config$/, (data) => ({
    razorpay: { enabled: false, keyId: null },
    cod: { enabled: false, extraFee: data.settings.codExtraFee },
    currency: data.settings.currency,
    storeName: data.settings.storeName,
  })],

  ['POST', /^\/cart\/quote$/, (data, _p, _params, body) => guestQuote(data, body)],
];

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Drop-in replacement for `fetch` against this app's API, so every caller —
 * caching, the 401 refresh path, `raw` responses — keeps working unchanged.
 */
export async function demoFetch(url, init = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const { pathname, searchParams } = new URL(url, window.location.origin);
  const path = pathname.replace(/^\/api/, '') || '/';

  // Sign-in is the one failure worth spelling out: the UI offers it, and a bare
  // 503 would not explain why it cannot work.
  if (path.startsWith('/auth/')) {
    return json(401, {
      ok: false,
      error: { message: 'Accounts are unavailable in the demo — there is no API server to sign in to.' },
    });
  }

  const match = ROUTES.find(([verb, pattern]) => verb === method && pattern.test(path));
  if (!match) return json(503, { ok: false, error: { message: UNAVAILABLE } });

  let body = null;
  if (typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      return json(400, { ok: false, error: { message: 'Malformed request body' } });
    }
  }

  try {
    const data = await load();
    const params = match[1].exec(path).slice(1).map(decodeURIComponent);
    const result = match[2](data, params, searchParams, body);
    // Handlers that page their results hand back `{ data, meta }`.
    const envelope = result && result.meta && 'data' in result ? result : { data: result };
    return json(200, { ok: true, ...envelope });
  } catch (err) {
    return json(err instanceof DemoError ? err.status : 500, { ok: false, error: { message: err.message } });
  }
}

/** Demo media ships beside the app rather than being served from an API origin. */
export const demoMediaUrl = (url) => `${import.meta.env.BASE_URL}${String(url).replace(/^\//, '')}`;
