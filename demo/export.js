/**
 * Builds the demo snapshot from a live database.
 *
 *   npm run demo:data
 *
 * Everything this writes stays inside demo/ — data.json and media/ — so the
 * whole folder can be deleted in one go once the real API is live. Nothing
 * under client/ or server/ depends on it existing; see demo/README.md.
 *
 * The output is generated but committed, because the GitHub Actions runner has
 * no database to export from.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../server/src/lib/prisma.js';
import { SETTINGS_GROUPS, SETTINGS_SCHEMA, getSettings } from '../server/src/services/settings.service.js';

const byId = (rows, id) => rows.find((r) => r.id === id);

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(demoDir, '../server/uploads');
const mediaDir = path.join(demoDir, 'media');
const dataFile = path.join(demoDir, 'data.json');

/** Longest edge for exported photos — page weight, not print. */
const MAX_EDGE = 1200;
const JPEG_QUALITY = 78;

let sipsAvailable = true;

/**
 * Copies one upload into demo/media, downscaling rasters on the way. The
 * originals are multi-megabyte camera PNGs; shipping those unchanged would make
 * the static site tens of megabytes.
 *
 * Returns the path to record in the JSON, or null if the file is missing.
 */
function exportMedia(url, seen) {
  if (!url || /^(https?:|data:)/.test(url)) return url || null;

  const name = path.basename(url);
  const source = path.join(uploadDir, name);
  if (!fs.existsSync(source)) {
    console.warn(`  ! missing upload, skipped: ${name}`);
    return null;
  }

  const isRaster = /\.(png|jpe?g|tiff?|heic|webp)$/i.test(name);
  const outName = isRaster && sipsAvailable ? `${name.replace(/\.[^.]+$/, '')}.jpg` : name;
  if (seen.has(outName)) return `demo-media/${outName}`;

  if (isRaster && sipsAvailable) {
    try {
      execFileSync(
        'sips',
        ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), '-Z', String(MAX_EDGE),
         source, '--out', path.join(mediaDir, outName)],
        { stdio: 'ignore' },
      );
      seen.add(outName);
      return `demo-media/${outName}`;
    } catch {
      // sips is macOS-only. Elsewhere ship the original rather than nothing.
      sipsAvailable = false;
      console.warn('  ! sips unavailable — copying images at full size');
    }
  }

  fs.copyFileSync(source, path.join(mediaDir, name));
  seen.add(name);
  return `demo-media/${name}`;
}

async function main() {
  fs.rmSync(mediaDir, { recursive: true, force: true });
  fs.mkdirSync(mediaDir, { recursive: true });

  const seen = new Set();
  const settings = await getSettings();

  // Full rows, not just the storefront projection: the admin screens read the
  // same records. The demo handlers filter and project, exactly as the two sets
  // of controllers do.
  const categoryRows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });
  const categories = categoryRows.map(({ _count, image, ...c }) => ({
    ...c,
    image: exportMedia(image, seen),
    productCount: _count.products,
  }));

  // Full rows again: the storefront sends a trimmed card while the admin sends
  // everything, and the adapter derives both from these.
  const productRows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { orderBy: { sortOrder: 'asc' } },
      reviews: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  const products = productRows.map((p) => ({
    ...p,
    images: p.images.map((img) => ({ ...img, url: exportMedia(img.url, seen) })).filter((img) => img.url),
    reviews: p.reviews.map((r) => ({ ...r, author: r.user.name })),
  }));

  // ------------------------------------------------------------------ people
  // Password hashes are deliberately NOT exported. This file is served from a
  // public URL; a bcrypt hash there is an offline cracking target, and the admin
  // one would match the live API. Demo sign-in uses the fixed credentials below,
  // which exist nowhere but this snapshot.
  const userRows = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const admin = userRows.find((u) => u.role === 'ADMIN');
  const shopper = userRows.find((u) => u.role === 'USER');

  const accounts = [
    admin && { email: 'admin@demo.test', password: 'demo-admin', label: 'Admin', userId: admin.id },
    shopper && { email: 'shopper@demo.test', password: 'demo-shopper', label: 'Customer', userId: shopper.id },
  ].filter(Boolean);

  // Rewrite the exported identities to the demo addresses, so the real admin
  // email is not advertised on a public page and nobody mistakes these for the
  // live logins.
  const users = userRows.map((u) => {
    const account = accounts.find((a) => a.userId === u.id);
    return account ? { ...u, email: account.email } : u;
  });

  // Reviews carry the reviewer's address; remap it like the user rows above.
  for (const product of products) {
    for (const review of product.reviews) {
      const mapped = byId(users, review.user.id);
      if (mapped) review.user = { ...review.user, email: mapped.email };
    }
  }

  const addresses = await prisma.address.findMany({ orderBy: { createdAt: 'asc' } });

  const orderRows = await prisma.order.findMany({
    orderBy: { placedAt: 'desc' },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'desc' } },
      shipment: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  // Gateway identifiers earn nothing in a demo, and the signature is an HMAC.
  // Drop them so a future export against live data cannot publish them.
  const orders = orderRows.map(({ razorpayOrderId, razorpayPaymentId, razorpaySignature, refundId, ...o }) => ({
    ...o,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    refundId: null,
  }));

  const wishlist = await prisma.wishlistItem.findMany({ select: { id: true, userId: true, productId: true, createdAt: true } });

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });

  // The admin settings form renders from this metadata, so it has to travel too.
  const overridden = new Set((await prisma.setting.findMany({ select: { key: true } })).map((r) => r.key));
  const settingsMeta = {
    fields: Object.entries(SETTINGS_SCHEMA).map(([key, spec]) => ({
      key,
      group: spec.group,
      type: spec.type,
      label: spec.label,
      hint: spec.hint ?? null,
      min: spec.min ?? null,
      max: spec.max ?? null,
      fields: spec.fields ?? null,
      isCustomised: overridden.has(key),
    })),
    groups: SETTINGS_GROUPS,
  };

  // Order rows carry a shipping name, email, phone and address. That is fine
  // here because every order belongs to the seeded demo customer, but it would
  // not be if real ones existed — check before regenerating on live data.
  const realCustomers = orders.filter((o) => !accounts.some((a) => a.userId === o.userId)).length;
  if (realCustomers) {
    console.warn(`  ! ${realCustomers} order(s) belong to accounts other than the demo ones —`);
    console.warn('    this snapshot is published, so review it for personal data before committing.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    accounts,
    settings,
    settingsMeta,
    categories,
    products,
    coupons,
    users,
    addresses,
    orders: orders.map(({ user, ...o }) => ({ ...o, user: user && { ...user, email: byId(users, user.id)?.email } })),
    wishlist,
  };
  fs.writeFileSync(dataFile, `${JSON.stringify(payload, null, 2)}\n`);

  const bytes = fs.readdirSync(mediaDir).reduce((n, f) => n + fs.statSync(path.join(mediaDir, f)).size, 0);
  console.log(`Wrote demo/data.json`);
  console.log(`  ${products.length} products, ${categories.length} categories, ${coupons.length} coupons`);
  console.log(`  ${orders.length} orders, ${users.length} users, ${addresses.length} addresses`);
  for (const a of accounts) console.log(`  sign in as ${a.label.padEnd(8)} ${a.email} / ${a.password}`);
  console.log(`  ${seen.size} media files -> demo/media (${(bytes / 1e6).toFixed(1)} MB)`);
  if (!products.some((p) => p.isFeatured)) {
    console.warn('  ! no featured products — the home page Bestsellers row will be empty');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
