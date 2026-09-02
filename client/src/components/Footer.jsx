import { Link } from 'react-router-dom';
import { LeafIcon, MailIcon, PackageIcon, PhoneIcon, ShieldIcon, TruckIcon } from './Icons';
import { useStore } from '../context/StoreContext';

// Navigation columns point at real routes, so they stay in code; every piece of
// prose below is admin-editable.
const COLUMNS = [
  {
    title: 'Shop',
    links: [
      ['/shop', 'All products'],
      ['/shop?category=vitamins-supplements', 'Vitamins & supplements'],
      ['/shop?category=ayurveda-herbs', 'Ayurveda & herbs'],
      ['/shop?category=protein-fitness', 'Protein & fitness'],
      ['/shop?category=health-devices', 'Health devices'],
    ],
  },
  {
    title: 'Your account',
    links: [
      ['/account', 'My account'],
      ['/account/orders', 'Order history'],
      ['/wishlist', 'Wishlist'],
      ['/track', 'Track a shipment'],
      ['/cart', 'Shopping cart'],
    ],
  },
  {
    title: 'Help',
    links: [
      ['/policies#shipping', 'Shipping & delivery'],
      ['/policies#returns', 'Returns & refunds'],
      ['/policies#privacy', 'Privacy policy'],
      ['/policies#terms', 'Terms of service'],
      ['/policies#contact', 'Contact us'],
    ],
  },
];

const PROMISE_ICONS = [ShieldIcon, TruckIcon, PackageIcon]

export default function Footer() {
  const settings = useStore();
  const [first, ...rest] = String(settings.storeName || 'Kupaa').split(' ');

  return (
    <footer className="mt-20 border-t border-ink-100 bg-ink-50/60">
      {settings.footerPromises?.length > 0 && (
        <div className="container-page grid gap-6 border-b border-ink-100 py-10 sm:grid-cols-3">
          {settings.footerPromises.map((promise, i) => {
            const Icon = PROMISE_ICONS[i % PROMISE_ICONS.length];
            return (
              <div key={promise.title || i} className="flex gap-3">
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-800">
                  <Icon width={20} height={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{promise.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{promise.copy}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white">
              <LeafIcon width={20} height={20} />
            </span>
            <span className="font-display text-lg font-bold text-ink-950">
              {first} {rest[0] ?? ''}
            </span>
          </div>

          {settings.footerBlurb && <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">{settings.footerBlurb}</p>}

          <div className="mt-4 space-y-1.5 text-sm text-ink-600">
            {settings.supportEmail && (
              <p className="flex items-center gap-2">
                <MailIcon width={15} height={15} />
                <a href={`mailto:${settings.supportEmail}`} className="hover:text-brand-700">
                  {settings.supportEmail}
                </a>
              </p>
            )}
            {settings.supportPhone && (
              <p className="flex items-center gap-2">
                <PhoneIcon width={15} height={15} />
                <a href={`tel:${settings.supportPhone.replace(/\s/g, '')}`} className="hover:text-brand-700">
                  {settings.supportPhone}
                </a>
              </p>
            )}
          </div>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-sm font-semibold text-ink-900">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map(([to, label]) => (
                <li key={label}>
                  <Link to={to} className="text-sm text-ink-500 transition hover:text-brand-700">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-ink-100">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-ink-500 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
          </p>
          <p className="text-center sm:text-right">
            Payments secured by Razorpay · Delivered by Amazon Shipping
            {settings.footerNote && (
              <>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> · </span>
                <span>{settings.footerNote}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
