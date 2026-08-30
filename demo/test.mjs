/**
 * Checks the demo adapter still answers like the API it stands in for.
 *
 *   npm run demo:test
 *
 * Worth re-running after `npm run demo:data`, since the assertions read the
 * snapshot: a catalogue change that breaks a page shows up here first.
 */
import { demoFetch } from './.test-bundle.mjs';

// The adapter resolves request URLs against the page origin, and keeps the
// session and the signed-in cart in localStorage.
globalThis.window ??= { location: { origin: 'https://example.test' } };
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log('  ok  ', label);
  } catch (err) {
    failures++;
    console.log('  FAIL', label, '-', err.message);
  }
};

const call = async (method, p, { body, token } = {}) => {
  const res = await demoFetch(`/api${p}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  return { status: res.status, body: await res.json() };
};
const get = (p, token) => call('GET', p, { token });
const post = (p, body, token) => call('POST', p, { body, token });
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
const ok = (cond, m) => {
  if (!cond) throw new Error(m);
};

const { body: all } = await get('/products?limit=60');
const catalogue = all.data;
ok(catalogue.length > 0, 'the snapshot has no products — run `npm run demo:data`');
const sample = catalogue.find((p) => p.hasVariants) ?? catalogue[0];

await check('GET /store returns settings', async () => {
  const { status, body } = await get('/store');
  eq(status, 200, 'status');
  ok(body.data.storeName, 'storeName missing');
});

await check('GET /categories carries productCount', async () => {
  const { body } = await get('/categories');
  ok(Array.isArray(body.data), 'not a list');
  ok(body.data.every((c) => typeof c.productCount === 'number'), 'productCount missing');
});

await check('GET /products paginates', async () => {
  const { body } = await get('/products?limit=2&page=1');
  eq(body.meta.limit, 2, 'limit');
  eq(body.meta.total, catalogue.length, 'total');
  ok(body.data.length <= 2, 'page too large');
});

await check('GET /products?q= matches case-insensitively', async () => {
  const word = sample.name.split(' ')[0];
  const lower = await get(`/products?q=${encodeURIComponent(word.toLowerCase())}`);
  const upper = await get(`/products?q=${encodeURIComponent(word.toUpperCase())}`);
  ok(lower.body.data.length > 0, `no match for "${word}"`);
  eq(lower.body.data.length, upper.body.data.length, 'casing changed the result');
});

await check('GET /products?category= filters', async () => {
  const slug = catalogue.find((p) => p.category)?.category.slug;
  if (!slug) return;
  const { body } = await get(`/products?category=${slug}`);
  ok(body.data.every((p) => p.category?.slug === slug), 'another category leaked in');
});

await check('sort=price_asc orders ascending', async () => {
  const { body } = await get('/products?sort=price_asc&limit=60');
  const prices = body.data.map((p) => p.price);
  eq(prices, [...prices].sort((a, b) => a - b), 'not sorted');
});

await check('GET /products/facets spans the price range', async () => {
  const { body } = await get('/products/facets');
  ok(body.data.priceMin <= body.data.priceMax, 'inverted range');
});

await check('GET /products/suggest needs two characters', async () => {
  eq((await get('/products/suggest?q=a')).body.data, [], 'one character should return nothing');
});

await check('GET /products/:slug returns a full detail payload', async () => {
  const { body } = await get(`/products/${sample.slug}`);
  eq(body.data.slug, sample.slug, 'slug');
  eq(body.data.ratingBreakdown.length, 5, 'rating breakdown');
  ok(Array.isArray(body.data.related), 'related missing');
  ok(body.data.related.every((r) => r.id !== body.data.id), 'related includes the product itself');
});

await check('GET /products/:slug 404s cleanly', async () => {
  const { status, body } = await get('/products/definitely-not-a-product');
  eq(status, 404, 'status');
  ok(body.error.message, 'no message');
});

await check('GET /payments/config disables both gateways', async () => {
  const { body } = await get('/payments/config');
  eq(body.data.razorpay.enabled, false, 'razorpay');
  eq(body.data.cod.enabled, false, 'cod');
});

await check('POST /cart/quote prices a line', async () => {
  const variantId = sample.variants?.[0]?.id ?? null;
  const { body } = await post('/cart/quote', { items: [{ productId: sample.id, variantId, quantity: 2 }] });
  eq(body.data.items.length, 1, 'line count');
  eq(body.data.totals.itemCount, 2, 'itemCount');
  eq(body.data.totals.subtotal, body.data.items[0].unitPrice * 2, 'subtotal');
});

await check('POST /cart/quote survives an invalid coupon', async () => {
  const variantId = sample.variants?.[0]?.id ?? null;
  const { status, body } = await post('/cart/quote', {
    items: [{ productId: sample.id, variantId, quantity: 1 }],
    couponCode: 'NOT-A-REAL-CODE',
  });
  eq(status, 200, 'status');
  ok(body.data.couponError, 'no couponError reported');
  eq(body.data.totals.discount, 0, 'discount should be zero');
});

await check('an empty cart quotes to zero', async () => {
  const { body } = await post('/cart/quote', { items: [] });
  eq(body.data.totals.subtotal, 0, 'subtotal');
});

await check('writes answer 503', async () => {
  eq((await post('/orders', {})).status, 503, 'status');
});

await check('every product image points into demo-media', async () => {
  for (const product of catalogue) {
    for (const img of product.images) {
      ok(img.url.startsWith('demo-media/'), `${product.name}: unexpected image path ${img.url}`);
    }
  }
});

// ------------------------------------------------------------ signed-in demo
const { body: snapshotAccounts } = await get('/store'); // ensures the snapshot is loaded
void snapshotAccounts;

const signIn = async (email, password) => {
  const { body } = await post('/auth/login', { email, password });
  if (!body.ok) throw new Error(`could not sign in as ${email}: ${body.error.message}`);
  return body.data.accessToken;
};

let shopperToken = null;
let adminToken = null;

await check('demo sign-in works for both accounts', async () => {
  shopperToken = await signIn('shopper@demo.test', 'demo-shopper');
  adminToken = await signIn('admin@demo.test', 'demo-admin');
  ok(shopperToken.startsWith('demo.'), 'unexpected token shape');
});

await check('a wrong password is rejected', async () => {
  const { status, body } = await post('/auth/login', { email: 'shopper@demo.test', password: 'nope' });
  eq(status, 401, 'status');
  ok(body.error.message, 'no message');
});

await check('signed-out requests to private endpoints are 401', async () => {
  eq((await get('/auth/me')).status, 401, '/auth/me');
  eq((await get('/orders')).status, 401, '/orders');
});

await check('a customer cannot reach admin endpoints', async () => {
  eq((await get('/admin/stats', shopperToken)).status, 403, 'status');
});

await check('GET /auth/me carries the profile counters', async () => {
  const { body } = await get('/auth/me', shopperToken);
  eq(body.data.user.role, 'USER', 'role');
  ok(typeof body.data.stats.orders === 'number', 'stats.orders missing');
});

await check('a customer sees only their own orders', async () => {
  const { body } = await get('/orders?limit=50', shopperToken);
  const me = (await get('/auth/me', shopperToken)).body.data.user.id;
  ok(body.data.length > 0, 'no orders in the snapshot');
  ok(body.data.every((o) => o.userId === me), 'another account\'s order leaked in');
});

await check('an order belonging to someone else 404s', async () => {
  const me = (await get('/auth/me', shopperToken)).body.data.user.id;
  const all = (await get('/admin/orders?limit=50', adminToken)).body.data;
  const other = all.find((o) => o.userId !== me);
  if (!other) return; // the snapshot only has the one customer
  eq((await get(`/orders/${other.id}`, shopperToken)).status, 404, 'status');
});

await check('the admin dashboard adds up', async () => {
  const { body } = await get('/admin/stats', adminToken);
  const d = body.data;
  eq(d.productCount, catalogue.length, 'productCount');
  ok(d.salesSeries.length === 14, 'expected a 14-day series');
  ok(d.revenueTotal >= 0, 'revenueTotal');
  ok(typeof d.statusCounts === 'object' && !Array.isArray(d.statusCounts), 'statusCounts should be an object');
});

await check('the signed-in cart adds, updates and clears', async () => {
  const variantId = sample.variants?.[0]?.id ?? null;
  await call('DELETE', '/cart', { token: shopperToken });

  const added = await post('/cart', { productId: sample.id, variantId, quantity: 2 }, shopperToken);
  eq(added.body.data.items.length, 1, 'after add');
  eq(added.body.data.totals.itemCount, 2, 'quantity after add');

  const id = added.body.data.items[0].id;
  const bumped = await call('PATCH', `/cart/${id}`, { body: { quantity: 3 }, token: shopperToken });
  eq(bumped.body.data.totals.itemCount, 3, 'quantity after patch');

  const removed = await call('DELETE', `/cart/${id}`, { token: shopperToken });
  eq(removed.body.data.items.length, 0, 'after delete');
});

await check('the guest cart merges in at sign-in', async () => {
  const variantId = sample.variants?.[0]?.id ?? null;
  await call('DELETE', '/cart', { token: shopperToken });
  const merged = await post('/cart/merge', { items: [{ productId: sample.id, variantId, quantity: 1 }] }, shopperToken);
  eq(merged.body.data.items.length, 1, 'merged line count');
  await call('DELETE', '/cart', { token: shopperToken });
});

await check('signed in, writes are still refused', async () => {
  eq((await post('/orders', {}, shopperToken)).status, 503, 'placing an order');
  eq((await post('/admin/products', {}, adminToken)).status, 503, 'creating a product');
});

console.log(failures ? `\n${failures} failing` : `\nall passing (${catalogue.length} products in the snapshot)`);
process.exit(failures ? 1 : 0);
