import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPORT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/export.json');

/**
 * Every table worth carrying between hosts, in an order that satisfies the
 * foreign keys: a row is only written once whatever it points at exists.
 *
 * `pk` is the column to match on when upserting — `id` everywhere except
 * Setting, which is keyed on `key`.
 */
export const MODELS = [
  { model: 'setting', pk: 'key' },
  { model: 'user' },
  { model: 'address' },
  { model: 'category' },
  { model: 'product' },
  { model: 'productImage' },
  { model: 'productVariant' },
  { model: 'coupon' },
  { model: 'review' },
  { model: 'order' },
  { model: 'orderItem' },
  { model: 'orderEvent' },
  { model: 'shipment' },
].map((m) => ({ pk: 'id', ...m }));

/** JSON has no date type, so ISO strings come back as strings. Prisma wants Dates. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const reviveDates = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && ISO.test(v) ? new Date(v) : v]));
