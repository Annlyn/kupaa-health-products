import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import { DEMO, DEMO_NOTICE } from 'virtual:demo';

export default function ShopLayout() {
  const { pathname, hash } = useLocation();

  // Route changes should start at the top, like a normal page load — unless the
  // link carried an anchor (the footer's policy links do), which the router
  // does not scroll to on its own.
  // Note the block body: an effect may only return a cleanup function, and
  // scrollTo's return value is not one.
  useEffect(() => {
    const target = hash && document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      {DEMO && <p className="bg-ink-900 px-4 py-2 text-center text-xs font-medium text-white">{DEMO_NOTICE}</p>}
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
