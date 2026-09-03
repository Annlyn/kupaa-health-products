import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, mediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { money } from '../lib/format';
import { CartIcon, CloseIcon, HeartIcon, LeafIcon, PackageIcon, SearchIcon, TruckIcon, UserIcon } from './Icons';
import { cx } from './ui';

const NAV = [
  { to: '/shop', label: 'Shop all' },
  { to: '/track', label: 'Track order' },
];

export function Logo({ className = '' }) {
  const { storeName } = useStore();

  return (
    <Link to="/" className={cx('flex -ml-2 items-center sm:-ml-1', className)} aria-label={`${storeName} home`}>
      <span className="relative grid h-20 w-24 shrink-0 place-items-center overflow-hidden sm:h-24 sm:w-28">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Kupaa logo"
          className="absolute left-0 top-0 h-full w-[140%] max-w-none object-contain object-left"
        />
      </span>
    </Link>
  );
}

function SearchBox({ onDone, onClose, autoFocus = false }) {
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
          autoFocus={autoFocus}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          className="input pl-10 pr-9"
          placeholder="Search"
          aria-label="Search products"
        />
        {(term || onClose) && (
          <button
            type="button"
            onClick={() => {
              if (onClose) return onClose();
              setTerm('');
              setSuggestions([]);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
            aria-label={onClose ? 'Close search' : 'Clear search'}
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
                  {s.images?.[0] && <img src={mediaUrl(s.images[0].url)} alt="" className="h-full w-full object-cover" />}
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
  const { pathname } = useLocation();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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
        <div className="flex h-20 items-center gap-4">
          <Logo />

          {pathname !== '/shop' && (
            <div className="ml-auto hidden max-w-md flex-1 lg:block">
              <SearchBox />
            </div>
          )}

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
                        className="block w-full border-t border-ink-100 px-4 py-2 text-left text-sm text-kupaa-black hover:bg-ink-200"
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

        {pathname === '/' && <div className="pb-2 lg:hidden">
          {mobileSearchOpen ? (
            <SearchBox autoFocus onDone={() => setMobileSearchOpen(false)} onClose={() => setMobileSearchOpen(false)} />
          ) : (
            <nav className="flex items-center justify-around border-t border-ink-100 pt-2" aria-label="Mobile navigation">
              <NavLink to="/shop" className="flex flex-col items-center gap-0.5 px-5 py-1 text-ink-600 transition hover:text-brand-700">
                <PackageIcon width={18} height={18} />
                <span className="text-[10px] font-medium">Shop all</span>
              </NavLink>
              <NavLink to="/track" className="flex flex-col items-center gap-0.5 px-5 py-1 text-ink-600 transition hover:text-brand-700">
                <TruckIcon width={18} height={18} />
                <span className="text-[10px] font-medium">Track order</span>
              </NavLink>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                className="flex flex-col items-center gap-0.5 px-5 py-1 text-ink-600 transition hover:text-brand-700"
                aria-label="Search products"
              >
                <SearchIcon width={18} height={18} />
                <span className="text-[10px] font-medium">Search</span>
              </button>
            </nav>
          )}
        </div>}

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

    </header>
  );
}
