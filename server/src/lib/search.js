import { env } from '../config/env.js';

/**
 * A case-insensitive "contains" filter that behaves the same on both databases.
 *
 * SQLite's LIKE ignores case for ASCII, so `{ contains: 'honey' }` matches
 * "Honey" locally. Postgres LIKE does not, so the same query silently stops
 * matching once deployed — searching "honey" would return nothing. Postgres
 * needs `mode: 'insensitive'`, which the SQLite connector rejects outright,
 * hence the branch.
 *
 *   where.OR = [{ name: like(q) }, { sku: like(q) }]
 */
export const like = (value) => (env.isPostgres ? { contains: value, mode: 'insensitive' } : { contains: value });
