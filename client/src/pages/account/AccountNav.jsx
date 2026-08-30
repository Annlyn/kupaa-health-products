import { NavLink } from 'react-router-dom';
import { MapPinIcon, PackageIcon, UserIcon } from '../../components/Icons';
import { cx } from '../../components/ui';

const LINKS = [
  { to: '/account', label: 'Profile', icon: UserIcon, end: true },
  { to: '/account/orders', label: 'My orders', icon: PackageIcon },
  { to: '/account/addresses', label: 'Addresses', icon: MapPinIcon },
];

/** Shared side navigation for every /account route. */
export default function AccountNav() {
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-40 lg:h-fit">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50',
                )
              }
            >
              <Icon width={17} height={17} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
