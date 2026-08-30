import { customAlphabet } from 'nanoid';

const digits = customAlphabet('0123456789', 6);

/** Human-readable, sortable-ish order reference: KUP-240830-482913 */
export function newOrderNumber(date = new Date()) {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `KUP-${y}${m}${d}-${digits()}`;
}
