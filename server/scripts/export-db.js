/**
 * Dumps the current database to JSON so it can be loaded into another one —
 * moving the local SQLite catalogue onto the deployed Postgres instance.
 *
 *   npm run db:export                 # reads DATABASE_URL from .env
 *
 * Then, pointed at the deployed database:
 *   DATABASE_URL="postgresql://…" npm run db:import
 *
 * Two commands rather than one because a generated Prisma client speaks exactly
 * one provider: the export runs against the SQLite client, and the import
 * regenerates for Postgres before it runs.
 *
 * Carts, wishlists, refresh tokens and webhook logs are deliberately skipped —
 * they are per-session scratch data, and copying live sessions to a new host
 * would just hand out tokens that no longer match.
 */
import fs from 'node:fs';
import { EXPORT_FILE, MODELS } from './db-transfer.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const data = {};
  for (const { model } of MODELS) {
    data[model] = await prisma[model].findMany();
    console.log(`  ${String(data[model].length).padStart(5)}  ${model}`);
  }

  fs.writeFileSync(EXPORT_FILE, `${JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)}\n`);
  console.log(`\nWrote ${EXPORT_FILE}`);
  console.log('Next:  DATABASE_URL="postgresql://…" npm run db:import');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
