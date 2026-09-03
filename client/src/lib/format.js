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

/* The fulfilment pipeline reads as a deepening sage: a pale tint on the way in,
   solid Herbal Sage once the parcel lands. States that fell out of the pipeline
   (cancelled, returned, refunded) sit in neutral ink so they recede, and only a
   hard failure keeps a warning red. */
export const STATUS_STYLES = {
  PENDING: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
  CONFIRMED: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  PACKED: 'bg-brand-100 text-brand-800 ring-1 ring-brand-300',
  SHIPPED: 'bg-brand-200 text-kupaa-black ring-1 ring-brand-400',
  DELIVERED: 'bg-brand-700 text-white ring-1 ring-brand-800',
  CANCELLED: 'bg-ink-100 text-ink-500 ring-1 ring-ink-200',
  RETURNED: 'bg-ink-200 text-ink-700 ring-1 ring-ink-300',
  PAID: 'bg-brand-700 text-white ring-1 ring-brand-800',
  FAILED: 'bg-kupaa-black text-white ring-1 ring-kupaa-black',
  REFUNDED: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
};

export const statusClass = (status) => STATUS_STYLES[status] || 'bg-ink-100 text-ink-700 ring-1 ring-ink-200';

export const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
