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
import { getSettings } from '../server/src/services/settings.service.js';
import { variantSelect } from '../server/src/services/variant.service.js';

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

  const categoryRows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, slug: true, description: true, image: true,
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });
  const categories = categoryRows.map(({ _count, image, ...c }) => ({
    ...c,
    image: exportMedia(image, seen),
    productCount: _count.products,
  }));

  const productRows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true, alt: true, sortOrder: true } },
      variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: variantSelect },
      reviews: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
    },
  });
  const products = productRows.map((p) => ({
    ...p,
    images: p.images.map((img) => ({ ...img, url: exportMedia(img.url, seen) })).filter((img) => img.url),
    reviews: p.reviews.map(({ user, userId, ...r }) => ({ ...r, author: user.name })),
  }));

  // Coupons are checked in the browser in demo mode, so only ship live ones.
  const coupons = await prisma.coupon.findMany({
    where: { isActive: true },
    select: {
      code: true, description: true, type: true, value: true,
      minOrder: true, maxDiscount: true, usageLimit: true, usedCount: true,
      startsAt: true, expiresAt: true,
    },
  });

  fs.writeFileSync(
    dataFile,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), settings, categories, products, coupons }, null, 2)}\n`,
  );

  const bytes = fs.readdirSync(mediaDir).reduce((n, f) => n + fs.statSync(path.join(mediaDir, f)).size, 0);
  console.log(`Wrote demo/data.json`);
  console.log(`  ${products.length} products, ${categories.length} categories, ${coupons.length} coupons`);
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
