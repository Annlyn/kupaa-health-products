/**
 * Points the Prisma datasource at whatever DATABASE_URL says.
 *
 * Prisma requires `provider` as a literal in the schema — it cannot be read
 * from an env var — so moving between SQLite locally and Postgres in production
 * used to mean hand-editing schema.prisma before every deploy and remembering
 * to change it back. This does it from the connection string instead, so the
 * same commit runs on both.
 *
 * Runs automatically before `prisma generate` / `db push`; see package.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/schema.prisma');

const url = process.env.DATABASE_URL || '';
const provider = /^postgres(ql)?:/.test(url) ? 'postgresql' : 'sqlite';

const schema = fs.readFileSync(schemaPath, 'utf8');
// Only inside `datasource db { … }` — the generator block has a provider too.
const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/,
  `$1${provider}$2`,
);

if (updated === schema) {
  console.log(`[db] provider already ${provider}`);
} else {
  fs.writeFileSync(schemaPath, updated);
  console.log(`[db] provider set to ${provider}`);
}

if (!url) {
  console.warn('[db] DATABASE_URL is empty — defaulted to sqlite. Set it before deploying.');
}
