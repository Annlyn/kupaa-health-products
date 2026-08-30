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
  'Demo mode: sign-in, browsing and the cart all run from a bundled snapshot. Nothing you do here is saved.';

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

/**
 * The snapshot carries full rows; these mirror the server's `select` clauses so
 * each endpoint returns exactly the columns its real counterpart does.
 */
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

const VARIANT_FIELDS = ['id', 'name', 'sku', 'price', 'mrp', 'stock', 'weightKg', 'isActive', 'sortOrder'];
const toVariant = (v) => pick(v, VARIANT_FIELDS);

const CARD_FIELDS = [
  'id', 'name', 'slug', 'sku', 'shortDesc', 'price', 'mrp', 'stock', 'isFeatured',
  'ratingAvg', 'ratingCount', 'tags', 'createdAt', 'variantLabel',
];
const toCard = (product) =>
  withVariantSummary({
    ...pick(product, CARD_FIELDS),
    category: product.category && pick(product.category, ['id', 'name', 'slug']),
    images: product.images.map((i) => pick(i, ['url', 'alt'])),
    variants: activeVariants(product).map(toVariant),
  });

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
    category: product.category && pick(product.category, ['id', 'name', 'slug']),
    variants: activeVariants(product).map(toVariant),
    // `user` is stripped and replaced by a bare author name, as on the server.
    reviews: product.reviews.slice(0, 20).map(({ user, ...r }) => r),
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

  if (!coupon || !coupon.isActive) throw new DemoError(400, 'That coupon code is not valid');
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

// -------------------------------------------------------------------- session
/**
 * Demo sign-in.
 *
 * There is no server, so there is no secret to keep: the accepted credentials
 * sit in data.json and anyone can read them out of the bundle. They are safe
 * precisely because they unlock nothing — the snapshot is a copy, every write
 * is refused, and the real API does not know these addresses.
 *
 * The token is `demo.<userId>`. The client already sends it as a bearer header
 * on every request and mirrors it in localStorage, so the shape of the session
 * is unchanged; only the issuing and checking move into the browser.
 */
const SESSION_KEY = 'kupaa_demo_session';
const TOKEN_PREFIX = 'demo.';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt });

/** Header names are case-insensitive; the client sets `Authorization`. */
function header(init, name) {
  const headers = init.headers || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota — the session simply will not survive a reload
  }
};

function signedInUser(data, init) {
  const auth = header(init, 'authorization') || '';
  const id = auth.startsWith(`Bearer ${TOKEN_PREFIX}`) ? auth.slice(`Bearer ${TOKEN_PREFIX}`.length) : null;
  return id ? data.users.find((u) => u.id === id) ?? null : null;
}

const sessionFor = (user) => ({ user: publicUser(user), accessToken: `${TOKEN_PREFIX}${user.id}` });

// ----------------------------------------------------------------- demo cart
/**
 * A signed-in shopper's cart. The guest cart already lives in localStorage and
 * is priced through /cart/quote; this is the same idea for the authenticated
 * half, so the cart keeps working across sign-in instead of emptying.
 */
const CART_KEY = 'kupaa_demo_cart';
const lineId = (productId, variantId) => `${productId}:${variantId ?? ''}`;
const readCart = () => (Array.isArray(readStore(CART_KEY, [])) ? readStore(CART_KEY, []) : []);

function cartResponse(data, params) {
  return guestQuote(data, {
    items: readCart(),
    couponCode: params.get('couponCode') || undefined,
    paymentMethod: params.get('paymentMethod') || 'RAZORPAY',
  });
}

function addToCart(data, body) {
  const { productId, variantId = null, quantity = 1 } = body || {};
  const product = data.products.find((p) => p.id === productId);
  if (!product) throw new DemoError(404, 'That product is not available');
  resolveSellable(product, variantId); // rejects a missing or unknown option

  const rows = readCart();
  const existing = rows.find((r) => r.productId === productId && (r.variantId ?? null) === variantId);
  const max = data.settings.maxQtyPerItem ?? 20;

  if (existing) existing.quantity = Math.min(max, existing.quantity + quantity);
  else rows.push({ productId, variantId, quantity: Math.min(max, quantity) });

  writeStore(CART_KEY, rows);
}

// ------------------------------------------------------------------- ordering
const paginate = (rows, params, fallbackLimit = 20) => {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || fallbackLimit);
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
};

const PAID_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

/** Mirrors GET /api/admin/stats, including the 14-day series with empty days. */
function adminStats(data) {
  const now = new Date();
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paid = data.orders.filter((o) => PAID_STATUSES.includes(o.status));

  const buckets = new Map();
  for (let i = 13; i >= 0; i--) {
    const key = dayStart(new Date(now.getTime() - i * 86400_000)).toISOString().slice(0, 10);
    buckets.set(key, { date: key, revenue: 0, orders: 0 });
  }
  for (const o of paid) {
    const bucket = buckets.get(dayStart(new Date(o.placedAt)).toISOString().slice(0, 10));
    if (bucket) {
      bucket.revenue = round2(bucket.revenue + o.total);
      bucket.orders += 1;
    }
  }

  const revenueTotal = round2(paid.reduce((n, o) => n + o.total, 0));
  const sold = new Map();
  for (const o of paid) {
    for (const item of o.items) {
      const row = sold.get(item.productId) ?? { productId: item.productId, name: item.name, unitsSold: 0 };
      row.unitsSold += item.quantity;
      sold.set(item.productId, row);
    }
  }

  const statuses = new Map();
  for (const o of data.orders) statuses.set(o.status, (statuses.get(o.status) ?? 0) + 1);

  return {
    revenueTotal,
    revenueMonth: round2(paid.filter((o) => new Date(o.placedAt) >= monthStart).reduce((n, o) => n + o.total, 0)),
    orderCount: data.orders.length,
    pendingCount: data.orders.filter((o) => ['PENDING', 'CONFIRMED'].includes(o.status)).length,
    customerCount: data.users.filter((u) => u.role === 'USER').length,
    productCount: data.products.length,
    avgOrderValue: data.orders.length ? round2(revenueTotal / data.orders.length) : 0,
    lowStock: data.products
      .filter((p) => p.stock <= 5)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
      .map((p) => ({ id: p.id, name: p.name, slug: p.slug, stock: p.stock, lowStockAt: p.lowStockAt, sku: p.sku })),
    recentOrders: data.orders.slice(0, 8).map((o) => ({
      id: o.id, orderNumber: o.orderNumber, total: o.total, status: o.status,
      paymentStatus: o.paymentStatus, placedAt: o.placedAt, shipName: o.shipName,
      user: o.user ? { name: o.user.name, email: o.user.email } : null,
    })),
    salesSeries: [...buckets.values()],
    topProducts: [...sold.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 6),
    statusCounts: Object.fromEntries(statuses),
    integrations: { razorpay: false, shiprocket: false },
  };
}

// -------------------------------------------------------------------- routing
/** `[method, pattern, handler]`. Handlers return the response `data`, or `{ data, meta }`. */
const liveCategories = (data) => data.categories.filter((c) => c.isActive);
const storefrontCategory = ({ id, name, slug, description, image, productCount }) =>
  ({ id, name, slug, description, image, productCount });

/**
 * `[method, pattern, handler, auth]` — auth is undefined (public), 'user' or
 * 'admin'. Handlers receive (data, pathParams, query, body, user) and return
 * the response `data`, or `{ data, meta }` when the real endpoint paginates.
 */
const ROUTES = [
  ['GET', /^\/health$/, () => ({ status: 'demo', service: 'Kupaa Health Products', time: new Date().toISOString() })],
  ['GET', /^\/store$/, (data) => data.settings],

  ['GET', /^\/categories$/, (data) => liveCategories(data).map(storefrontCategory)],
  ['GET', /^\/categories\/([^/]+)$/, (data, [slug]) => {
    const category = liveCategories(data).find((c) => c.slug === slug);
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
      categories: liveCategories(data).map(({ id, name, slug, image, productCount }) => ({ id, name, slug, image, productCount })),
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

  // ------------------------------------------------------------------- auth
  ['POST', /^\/auth\/login$/, (data, _p, _params, body) => {
    const email = String(body?.email || '').trim().toLowerCase();
    const account = data.accounts.find((a) => a.email === email && a.password === body?.password);
    if (!account) throw new DemoError(401, 'Email or password is incorrect');

    const user = data.users.find((u) => u.id === account.userId);
    if (!user) throw new DemoError(401, 'That demo account is missing from the snapshot');
    writeStore(SESSION_KEY, user.id);
    return sessionFor(user);
  }],

  ['POST', /^\/auth\/refresh$/, (data) => {
    // Stands in for the httpOnly refresh cookie: a reload restores the session.
    const id = readStore(SESSION_KEY, null);
    const user = id && data.users.find((u) => u.id === id);
    if (!user) throw new DemoError(401, 'Session expired, please sign in again');
    return sessionFor(user);
  }],

  ['POST', /^\/auth\/logout$/, () => {
    writeStore(SESSION_KEY, null);
    return { ok: true };
  }],

  ['GET', /^\/auth\/me$/, (data, _p, _params, _body, user) => ({
    user: publicUser(user),
    stats: {
      orders: data.orders.filter((o) => o.userId === user.id).length,
      wishlist: data.wishlist.filter((w) => w.userId === user.id).length,
    },
  }), 'user'],

  // ------------------------------------------------------------------- cart
  ['GET', /^\/cart$/, (data, _p, params) => cartResponse(data, params), 'user'],
  ['POST', /^\/cart$/, (data, _p, params, body) => {
    addToCart(data, body);
    return cartResponse(data, params);
  }, 'user'],
  ['POST', /^\/cart\/merge$/, (data, _p, params, body) => {
    for (const item of body?.items ?? []) {
      try {
        addToCart(data, item);
      } catch {
        // a withdrawn product in the guest cart is dropped, as on the server
      }
    }
    return cartResponse(data, params);
  }, 'user'],
  ['PATCH', /^\/cart\/([^/]+)$/, (data, [id], params, body) => {
    const quantity = Number(body?.quantity ?? 0);
    const rows = readCart().filter((r) => lineId(r.productId, r.variantId) !== id || quantity > 0);
    const row = rows.find((r) => lineId(r.productId, r.variantId) === id);
    if (row) row.quantity = quantity;
    writeStore(CART_KEY, rows);
    return cartResponse(data, params);
  }, 'user'],
  ['DELETE', /^\/cart\/([^/]+)$/, (data, [id], params) => {
    writeStore(CART_KEY, readCart().filter((r) => lineId(r.productId, r.variantId) !== id));
    return cartResponse(data, params);
  }, 'user'],
  ['DELETE', /^\/cart$/, (data, _p, params) => {
    writeStore(CART_KEY, []);
    return cartResponse(data, params);
  }, 'user'],

  // ---------------------------------------------------------------- account
  ['GET', /^\/orders$/, (data, _p, params, _body, user) => {
    const status = params.get('status');
    const mine = data.orders.filter((o) => o.userId === user.id && (!status || o.status === status));
    return paginate(mine.map(({ events, user: owner, ...o }) => o), params, 10);
  }, 'user'],

  ['GET', /^\/orders\/([^/]+)$/, (data, [id], _params, _body, user) => {
    const order = data.orders.find((o) => (o.id === id || o.orderNumber === id) && o.userId === user.id);
    if (!order) throw new DemoError(404, 'Order not found');
    return order;
  }, 'user'],

  ['GET', /^\/addresses$/, (data, _p, _params, _body, user) =>
    data.addresses
      .filter((a) => a.userId === user.id)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || new Date(b.createdAt) - new Date(a.createdAt)),
  'user'],

  ['GET', /^\/wishlist$/, (data, _p, _params, _body, user) =>
    data.wishlist
      .filter((w) => w.userId === user.id)
      .map((w) => data.products.find((p) => p.id === w.productId))
      .filter(Boolean)
      .map(toCard),
  'user'],

  // ------------------------------------------------------------------ admin
  ['GET', /^\/admin\/stats$/, (data) => adminStats(data), 'admin'],

  ['GET', /^\/admin\/products$/, (data, _p, params) => {
    const q = (params.get('q') || '').trim().toLowerCase();
    const category = params.get('category');
    const rows = data.products.filter((p) => {
      if (category && p.categoryId !== category) return false;
      if (q && ![p.name, p.sku, p.tags].some((f) => contains(f, q))) return false;
      return true;
    });
    const sorted = [...rows].sort({
      name: (a, b) => a.name.localeCompare(b.name),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      stock: (a, b) => a.stock - b.stock,
    }[params.get('sort')] ?? SORTS.newest);
    return paginate(
      sorted.map(({ reviews, ...p }) => ({
        ...p,
        category: p.category && pick(p.category, ['id', 'name', 'slug']),
        images: p.images.slice(0, 1),
        variants: activeVariants(p).map(toVariant),
        // Sales per product are not exported; the admin list only shows whether
        // a product can be hard-deleted, which nothing can be in the demo.
        _count: { orderItems: 0 },
      })),
      params,
    );
  }, 'admin'],

  ['GET', /^\/admin\/products\/([^/]+)$/, (data, [id]) => {
    const product = data.products.find((p) => p.id === id);
    if (!product) throw new DemoError(404, 'Product not found');
    // The admin form reads whole rows, including inactive variants.
    const { reviews, ...rest } = product;
    return rest;
  }, 'admin'],

  ['GET', /^\/admin\/orders$/, (data, _p, params) => {
    const status = params.get('status');
    const paymentStatus = params.get('paymentStatus');
    const q = (params.get('q') || '').trim().toLowerCase();
    const rows = data.orders.filter((o) => {
      if (status && status !== 'all' && o.status !== status) return false;
      if (paymentStatus && paymentStatus !== 'all' && o.paymentStatus !== paymentStatus) return false;
      if (q && ![o.orderNumber, o.shipName, o.shipEmail, o.shipPhone].some((f) => contains(f, q))) return false;
      return true;
    });
    const page = paginate(rows.map(({ events, ...o }) => ({ ...o, user: o.user && { name: o.user.name, email: o.user.email } })), params);
    page.meta.revenue = round2(rows.reduce((n, o) => n + o.total, 0));
    return page;
  }, 'admin'],

  ['GET', /^\/admin\/orders\/([^/]+)$/, (data, [id]) => {
    const order = data.orders.find((o) => o.id === id || o.orderNumber === id);
    if (!order) throw new DemoError(404, 'Order not found');
    return order;
  }, 'admin'],

  ['GET', /^\/admin\/categories$/, (data) => data.categories, 'admin'],
  ['GET', /^\/admin\/coupons$/, (data) => data.coupons, 'admin'],

  ['GET', /^\/admin\/users$/, (data, _p, params) => {
    const q = (params.get('q') || '').trim().toLowerCase();
    const role = params.get('role');
    const rows = data.users.filter((u) => {
      if (role && role !== 'all' && u.role !== role) return false;
      if (q && ![u.name, u.email, u.phone].some((f) => contains(f, q))) return false;
      return true;
    });
    return paginate(
      rows.map((u) => {
        const theirs = data.orders.filter((o) => o.userId === u.id);
        return {
          ...u,
          orderCount: theirs.length,
          totalSpent: round2(theirs.filter((o) => PAID_STATUSES.includes(o.status)).reduce((n, o) => n + o.total, 0)),
        };
      }),
      params,
    );
  }, 'admin'],

  ['GET', /^\/admin\/users\/([^/]+)$/, (data, [id]) => {
    const user = data.users.find((u) => u.id === id);
    if (!user) throw new DemoError(404, 'User not found');
    return {
      ...user,
      addresses: data.addresses.filter((a) => a.userId === id),
      orders: data.orders.filter((o) => o.userId === id).slice(0, 20).map(({ events, user: owner, ...o }) => o),
    };
  }, 'admin'],

  ['GET', /^\/admin\/reviews$/, (data, _p, params) => {
    const reviews = data.products.flatMap((p) =>
      p.reviews.map(({ author, ...r }) => ({
        ...r,
        product: pick(p, ['id', 'name', 'slug']),
      })),
    );
    const page = paginate(reviews, params);
    page.meta.breakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return page;
  }, 'admin'],

  ['GET', /^\/admin\/settings$/, (data) => ({
    values: data.settings,
    fields: data.settingsMeta.fields,
    groups: data.settingsMeta.groups,
  }), 'admin'],
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

  const match = ROUTES.find(([verb, pattern]) => verb === method && pattern.test(path));
  if (!match) {
    // Everything unmatched is a write. Say which kind, because "changes are not
    // saved" is the one thing a demo visitor needs to understand.
    const message = path.startsWith('/auth/')
      ? 'Editing your account is not available in the demo.'
      : UNAVAILABLE;
    return json(503, { ok: false, error: { message } });
  }

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
    const [, pattern, handler, auth] = match;

    const user = signedInUser(data, init);
    if (auth && !user) throw new DemoError(401, 'You need to sign in');
    if (auth === 'admin' && user.role !== 'ADMIN') throw new DemoError(403, 'You do not have access to this');

    const params = pattern.exec(path).slice(1).map(decodeURIComponent);
    const result = handler(data, params, searchParams, body, user);
    // Handlers that page their results hand back `{ data, meta }`.
    const envelope = result && result.meta && 'data' in result ? result : { data: result };
    return json(200, { ok: true, ...envelope });
  } catch (err) {
    return json(err instanceof DemoError ? err.status : 500, { ok: false, error: { message: err.message } });
  }
}

/**
 * The logins this build accepts.
 *
 * The app's rule is that credentials are never printed in the UI. This is the
 * one deliberate exception, and only in a demo build: these identities exist
 * nowhere but this snapshot, the real API has never heard of them, every write
 * is refused, and they are already readable in the bundle — a demo nobody can
 * sign into is not a demo.
 */
export const demoAccounts = () =>
  load().then((data) => data.accounts.map(({ email, password, label }) => ({ email, password, label })));

/** Demo media ships beside the app rather than being served from an API origin. */
export const demoMediaUrl = (url) => `${import.meta.env.BASE_URL}${String(url).replace(/^\//, '')}`;
