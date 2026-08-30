/**
 * Checks the demo adapter still answers like the API it stands in for.
 *
 *   npm run demo:test
 *
 * Worth re-running after `npm run demo:data`, since the assertions read the
 * snapshot: a catalogue change that breaks a page shows up here first.
 */
import { demoFetch } from './.test-bundle.mjs';

// The adapter resolves request URLs against the page origin.
globalThis.window ??= { location: { origin: 'https://example.test' } };

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

const get = async (p) => {
  const res = await demoFetch(`/api${p}`);
  return { status: res.status, body: await res.json() };
};
const post = async (p, body) => {
  const res = await demoFetch(`/api${p}`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
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

await check('auth answers 401 and explains why', async () => {
  const { status, body } = await post('/auth/login', { email: 'a@b.c', password: 'x' });
  eq(status, 401, 'status');
  ok(/demo/i.test(body.error.message), 'message should mention the demo');
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

console.log(failures ? `\n${failures} failing` : `\nall passing (${catalogue.length} products in the snapshot)`);
process.exit(failures ? 1 : 0);
