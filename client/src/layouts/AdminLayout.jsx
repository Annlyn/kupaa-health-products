import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import {
  CloseIcon,
  DashboardIcon,
  EditIcon,
  LeafIcon,
  LogoutIcon,
  MenuIcon,
  PackageIcon,
  SettingsIcon,
  StarIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
} from '../components/Icons';
import { cx } from '../components/ui';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/admin/orders', label: 'Orders', icon: TruckIcon },
  { to: '/admin/products', label: 'Products', icon: PackageIcon },
  { to: '/admin/categories', label: 'Categories', icon: TagIcon },
  { to: '/admin/coupons', label: 'Coupons', icon: TagIcon },
  { to: '/admin/customers', label: 'Customers', icon: UsersIcon },
  { to: '/admin/reviews', label: 'Reviews', icon: StarIcon },
  { to: '/admin/settings', label: 'Store settings', icon: EditIcon },
  { to: '/admin/integrations', label: 'Integrations', icon: SettingsIcon },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { storeName } = useStore();
  const shortName = String(storeName || 'Store').split(' ')[0];
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const nav = (
    <nav className="flex-1 space-y-0.5 p-3">
      {LINKS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-300 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <Icon width={18} height={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarBody = (
    <>
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
          <LeafIcon width={19} height={19} />
        </span>
        <div className="leading-none">
          <p className="font-display text-base font-bold text-white">{shortName}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Admin console</p>
        </div>
      </div>

      {nav}

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-medium text-white">{user?.name}</p>
          <p className="truncate text-xs text-ink-400">{user?.email}</p>
        </div>
        <NavLink to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white">
          <LeafIcon width={17} height={17} /> View storefront
        </NavLink>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-white/10"
        >
          <LogoutIcon width={17} height={17} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink-950 lg:flex">{sidebarBody}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink-950">{sidebarBody}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <button className="btn-ghost" onClick={() => setOpen(true)} aria-label="Open admin menu">
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
          <span className="font-display text-base font-bold">{shortName} Admin</span>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
