const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const money = (value) => inr.format(Number(value || 0));

/** "₹1,499" or "₹1,499 – ₹4,999" when a product has several sizes. */
export const priceRange = (product) => {
  const from = product.priceFrom ?? product.price;
  const to = product.priceTo ?? product.price;
  return from === to ? money(from) : `${money(from)} – ${money(to)}`;
};

export const percentOff = (mrp, price) => {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
};

export const dateShort = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const dateTime = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const relative = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateShort(value);
};

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  PACKED: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  SHIPPED: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  RETURNED: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  PAID: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  REFUNDED: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

export const statusClass = (status) => STATUS_STYLES[status] || 'bg-ink-100 text-ink-700 ring-1 ring-ink-200';

export const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
