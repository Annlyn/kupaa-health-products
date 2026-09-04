import { Link } from 'react-router-dom';
import { FacebookIcon, InstagramIcon, MailIcon, PhoneIcon, YoutubeIcon } from './Icons';
import { Logo } from './Header';
import { useStore } from '../context/StoreContext';

/** Mirrors the sections the policies page renders, so no link lands on a gap. */
const POLICIES = [
  { to: '/policies#shipping', label: 'Shipping & delivery', key: 'policyShipping' },
  { to: '/policies#returns', label: 'Returns & refunds', key: 'policyReturns' },
  { to: '/policies#privacy', label: 'Privacy policy', key: 'policyPrivacy' },
  { to: '/policies#terms', label: 'Terms of service', key: 'policyTerms' },
  { to: '/policies#contact', label: 'Contact us', key: 'policyContact' },
];

export default function Footer() {
  const settings = useStore();

  const policies = POLICIES.filter((p) => String(settings[p.key] || '').trim());
  const socials = [
    { url: settings.socialInstagramUrl, label: 'Instagram', Icon: InstagramIcon },
    { url: settings.socialYoutubeUrl, label: 'YouTube', Icon: YoutubeIcon },
    { url: settings.socialFacebookUrl, label: 'Facebook', Icon: FacebookIcon },
  ].filter((s) => s.url);

  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          {/* The stacked lockup sits at 30%-71% across footer_logo.png and 7%-83%
              down it, so the image is blown up to 133% of the frame's height
              and pulled back by that padding — which lands the artwork flush
              with the column's left edge and tight to the top. */}
          <Logo
            className="ml-2 sm:-ml-1"
            src="footer_logo.png"
            frameClassName="h-24 w-[74px]"
            imgClassName="left-[-72.4%] top-[-9.7%] h-[133%] w-auto"
          />
          {/* <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
            {settings.footerBlurb || settings.storeTagline}
          </p> */}

          {socials.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="rounded-full border border-ink-200 p-2 text-ink-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Icon width={16} height={16} />
                </a>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Policies">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-900">Policies</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            {(policies.length ? policies : [{ to: '/policies', label: 'Policies & help', key: 'all' }]).map((p) => (
              <li key={p.key}>
                <Link to={p.to} className="transition hover:text-brand-700">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-900">Get in touch</h2>
          <ul className="mt-3 space-y-2.5 text-sm text-ink-500">
            {settings.supportEmail && (
              <li>
                <a href={`mailto:${settings.supportEmail}`} className="flex items-center gap-2 transition hover:text-brand-700">
                  <MailIcon width={15} height={15} className="shrink-0 text-ink-400" />
                  {settings.supportEmail}
                </a>
              </li>
            )}
            {settings.supportPhone && (
              <li>
                <a
                  href={`tel:${settings.supportPhone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 transition hover:text-brand-700"
                >
                  <PhoneIcon width={15} height={15} className="shrink-0 text-ink-400" />
                  {settings.supportPhone}
                </a>
              </li>
            )}
          </ul>
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
