import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { money } from '../lib/format';
import { CartIcon, CloseIcon, HeartIcon, LeafIcon, MenuIcon, SearchIcon, UserIcon } from './Icons';
import { cx } from './ui';

const NAV = [
  { to: '/shop', label: 'Shop all' },
  { to: '/track', label: 'Track order' },
];

export function Logo({ className = '' }) {
  const { storeName } = useStore();
  // "Kupaa Health Products" -> bold "Kupaa" over a small-caps "Health Products".
  const [first, ...rest] = String(storeName || 'Kupaa').split(' ');

  return (
    <Link to="/" className={cx('flex items-center gap-2.5', className)} aria-label={`${storeName} home`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white">
        <LeafIcon width={20} height={20} />
      </span>
      <span className="leading-none">
        <span className="block font-display text-lg font-bold text-ink-950">{first}</span>
        {rest.length > 0 && (
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">{rest.join(' ')}</span>
        )}
      </span>
    </Link>
  );
}

function SearchBox({ onDone }) {
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);

  // Debounced type-ahead against /products/suggest.
  useEffect(() => {
    if (term.trim().length < 2) return setSuggestions([]);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/products/suggest?q=${encodeURIComponent(term.trim())}`, { signal: controller.signal });
        setSuggestions(data);
        setOpen(true);
      } catch {
        /* aborted or offline */
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    const onClick = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setOpen(false);
    onDone?.();
    navigate(`/shop?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          className="input pl-10 pr-9"
          placeholder="Search vitamins, ashwagandha, whey protein…"
          aria-label="Search products"
        />
        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              setSuggestions([]);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
            aria-label="Clear search"
          >
            <CloseIcon width={15} height={15} />
          </button>
        )}
      </form>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-lift">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <Link
                to={`/product/${s.slug}`}
                onClick={() => {
                  setOpen(false);
                  onDone?.();
                }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-ink-50"
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-ink-100">
                  {s.images?.[0] && <img src={s.images[0].url} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{s.name}</span>
                <span className="text-sm font-semibold text-ink-900">{money(s.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Header() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { count, openDrawer } = useCart();
  const { announcementEnabled, announcementText } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
      {announcementEnabled && announcementText && (
        <p className="bg-brand-800 px-4 py-2 text-center text-xs font-medium text-brand-50">{announcementText}</p>
      )}

      <div className="container-page">
        <div className="flex h-16 items-center gap-4">
          <button className="btn-ghost -ml-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </button>

          <Logo />

          <div className="ml-auto hidden max-w-md flex-1 lg:block">
            <SearchBox />
          </div>

          <nav className="ml-auto flex items-center gap-1 lg:ml-2">
            <Link to="/wishlist" className="btn-ghost hidden sm:inline-flex" aria-label="Wishlist">
              <HeartIcon />
            </Link>

            <div ref={menuRef} className="relative">
              <button className="btn-ghost" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu">
                <UserIcon />
                <span className="hidden text-sm md:inline">{isAuthenticated ? user.name.split(' ')[0] : 'Account'}</span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-ink-100 bg-white py-1.5 shadow-lift"
                >
                  {isAuthenticated ? (
                    <>
                      <div className="border-b border-ink-100 px-4 pb-2.5 pt-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
                        <p className="truncate text-xs text-ink-500">{user.email}</p>
                      </div>
                      {[
                        ['/account', 'My account'],
                        ['/account/orders', 'My orders'],
                        ['/wishlist', 'Wishlist'],
                        ['/account/addresses', 'Addresses'],
                      ].map(([to, label]) => (
                        <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-ink-50">
                          {label}
                        </Link>
                      ))}
                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="block border-t border-ink-100 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          Admin dashboard
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="block w-full border-t border-ink-100 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to="/login" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-ink-50">
                        Sign in
                      </Link>
                      <Link to="/register" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-ink-50">
                        Create an account
                      </Link>
                      <Link to="/track" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-ink-50">
                        Track an order
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            <button onClick={openDrawer} className="btn-ghost relative" aria-label={`Cart, ${count} items`}>
              <CartIcon />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="pb-3 lg:hidden">
          <SearchBox />
        </div>

        <nav className="hidden gap-6 border-t border-ink-100 py-2.5 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  'text-sm font-medium transition hover:text-brand-700',
                  isActive && item.to === '/shop' ? 'text-brand-700' : 'text-ink-600',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-4">
              <Logo />
              <button className="btn-ghost" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <CloseIcon />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-ink-100" />
              <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm hover:bg-ink-50">
                Wishlist
              </Link>
              <Link to="/account" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm hover:bg-ink-50">
                My account
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Admin dashboard
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
