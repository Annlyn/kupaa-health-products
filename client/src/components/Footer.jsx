import { Link } from 'react-router-dom';
import { MailIcon, PhoneIcon } from './Icons';
import { useStore } from '../context/StoreContext';

export default function Footer() {
  const settings = useStore();
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="container-page flex flex-col gap-5 py-7 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="font-display text-lg font-bold text-ink-950" aria-label={`${settings.storeName} home`}>
          {settings.storeName}
        </Link>

        <nav aria-label="Footer" className="text-sm text-ink-500">
          <Link to="/policies" className="transition hover:text-brand-700">
            Policies
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
          {settings.supportEmail && <a href={`mailto:${settings.supportEmail}`} className="flex items-center gap-1.5 hover:text-brand-700"><MailIcon width={14} height={14} /> {settings.supportEmail}</a>}
          {settings.supportPhone && <a href={`tel:${settings.supportPhone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:text-brand-700"><PhoneIcon width={14} height={14} /> {settings.supportPhone}</a>}
        </div>
      </div>

      <div className="border-t border-ink-100">
        <div className="container-page flex flex-col gap-1 py-3 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {settings.storeName}. All rights reserved.</p>
          {settings.footerNote && <p>{settings.footerNote}</p>}
        </div>
      </div>
    </footer>
  );
}
