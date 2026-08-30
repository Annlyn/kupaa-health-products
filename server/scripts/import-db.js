/**
 * Loads a `db:export` dump into the database DATABASE_URL points at, then
 * optionally re-uploads the product imagery that goes with it.
 *
 *   DATABASE_URL="postgresql://…" npm run db:import
 *   DATABASE_URL="postgresql://…" npm run db:import -- --media https://kupaa-api.onrender.com
 *
 * Rows are upserted by primary key, so re-running is safe and a half-finished
 * run can simply be repeated. Note that re-running with --media also re-uploads
 * every image: the row import resets the URLs to the ones in the dump, and the
 * old server-side copies are then orphaned. To redo just one half, pass
 * --skip-rows (media only) or drop --media (rows only).
 *
 * --media exists because image files live on the server's disk, not in the
 * database: the dump carries the *paths* ("/uploads/x.jpg") but the new host's
 * disk is empty, so every product would render a broken image. There is no
 * remote filesystem to copy into, so the files go through the same authenticated
 * endpoint the admin UI uses, and the resulting URLs are written back to the
 * rows that referenced them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXPORT_FILE, MODELS, reviveDates } from './db-transfer.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

function readDump() {
  if (!fs.existsSync(EXPORT_FILE)) {
    throw new Error(`No dump at ${EXPORT_FILE}. Run \`npm run db:export\` against the source database first.`);
  }
  return JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8')).data;
}

async function importRows(data) {
  for (const { model, pk } of MODELS) {
    const rows = (data[model] ?? []).map(reviveDates);
    let written = 0;
    for (const row of rows) {
      // Upsert rather than createMany: it makes the whole script re-runnable,
      // which matters when a connection drops halfway through a large order table.
      await prisma[model].upsert({ where: { [pk]: row[pk] }, create: row, update: row });
      written++;
    }
    console.log(`  ${String(written).padStart(5)}  ${model}`);
  }
}

const UPLOADABLE = /\.(jpe?g|png|webp|avif|gif)$/i;

/**
 * The upload endpoint refuses SVG — it is served from the API origin, and an
 * SVG can carry script. The seeded category artwork is SVG, so rasterise it
 * first rather than either loosening that rule or losing the images.
 *
 * Returns a path to an uploadable file, or null if this one cannot be converted.
 */
function prepareForUpload(source, tmpDir) {
  if (UPLOADABLE.test(source)) return source;
  if (!/\.svg$/i.test(source)) return null;

  try {
    // qlmanage is macOS-only; there is no cross-platform rasteriser here that
    // does not pull in a native dependency for this one-off migration.
    execFileSync('qlmanage', ['-t', '-s', '1200', '-o', tmpDir, source], { stdio: 'ignore' });
    const out = path.join(tmpDir, `${path.basename(source)}.png`);
    return fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
};

/** Uploads one local file through the admin API and returns its new URL. */
async function uploadFile(api, token, filePath) {
  const form = new FormData();
  const buffer = fs.readFileSync(filePath);
  // The type matters: multer filters on mimetype, and a Blob with none set is
  // sent as application/octet-stream and rejected.
  const type = MIME[path.extname(filePath).toLowerCase()];
  form.append('images', new Blob([buffer], { type }), path.basename(filePath));

  const res = await fetch(`${api}/api/admin/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error?.message || `upload failed (${res.status})`);
  return payload.data[0].url;
}

async function syncMedia(api) {
  const email = arg('email') || env.admin.email;
  const password = arg('password') || process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Set ADMIN_PASSWORD or pass --password to upload media.');

  const res = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Admin sign-in failed: ${body?.error?.message || res.status}`);
  const token = body.data.accessToken;

  const localDir = path.resolve(process.cwd(), env.uploadDir);
  const [images, categories] = await Promise.all([
    prisma.productImage.findMany({ select: { id: true, url: true } }),
    prisma.category.findMany({ select: { id: true, image: true } }),
  ]);

  const targets = [
    ...images.map((r) => ({ model: 'productImage', id: r.id, field: 'url', value: r.url })),
    ...categories.map((r) => ({ model: 'category', id: r.id, field: 'image', value: r.image })),
  ].filter((t) => t.value?.startsWith('/uploads/'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kupaa-media-'));
  const uploaded = new Map();
  const failed = [];
  const skipped = [];

  try {
    for (const target of targets) {
      const name = path.basename(target.value);

      if (!uploaded.has(name)) {
        const source = path.join(localDir, name);
        if (!fs.existsSync(source)) {
          // Almost always a row already migrated by an earlier run: it now
          // points at a name the server generated, which was never in the
          // source directory. Touching it would undo a good migration.
          skipped.push(name);
          uploaded.set(name, { url: null, existed: false });
        } else {
          const ready = prepareForUpload(source, tmpDir);
          if (ready) {
            const url = await uploadFile(api, token, ready);
            uploaded.set(name, { url, existed: true });
            console.log(`  uploaded ${name} -> ${url}`);
          } else {
            failed.push(name);
            uploaded.set(name, { url: null, existed: true });
          }
        }
      }

      const { url, existed } = uploaded.get(name);
      if (url) {
        await prisma[target.model].update({ where: { id: target.id }, data: { [target.field]: url } });
      } else if (existed && target.model === 'category') {
        // The file is here but cannot be uploaded. A category with no image
        // renders as a plain tile, which beats a broken one. Product image rows
        // are left alone — dropping a photo silently is worse than reporting it.
        await prisma.category.update({ where: { id: target.id }, data: { image: null } });
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const count = [...uploaded.values()].filter((u) => u.url).length;
  console.log(`\n${count} file(s) uploaded.`);

  if (skipped.length) {
    // Expected on a media-only re-run: these rows already point at names the
    // server generated, which never existed in the source directory.
    console.log(`${skipped.length} already migrated (not in ${localDir}), left untouched.`);
  }
  if (failed.length) {
    console.warn(`${failed.length} could not be converted to an uploadable image:`);
    for (const f of failed) console.warn(`  ! ${f}`);
  }
}

async function main() {
  if (!env.isPostgres) {
    console.warn('[import] DATABASE_URL is not Postgres — importing into SQLite. Intentional?');
  }

  console.log(`Target: ${(process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':****@')}`);

  if (flag('skip-rows')) {
    console.log('Skipping rows (--skip-rows).');
  } else {
    await importRows(readDump());
  }

  const api = arg('media');
  if (api) {
    console.log(`\nSyncing media through ${api}`);
    await syncMedia(api.replace(/\/$/, ''));
  } else {
    console.log('\nSkipped media. Re-run with `-- --media https://your-api.onrender.com` to upload images.');
  }
}

main()
  .catch((err) => {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
