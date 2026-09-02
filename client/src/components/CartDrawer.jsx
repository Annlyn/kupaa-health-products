import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { money } from '../lib/format';
import { CartIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon, TruckIcon } from './Icons';
import { ProductImage } from './ProductCard';
import { EmptyState, Spinner } from './ui';

export default function CartDrawer() {
  const { items, totals, loading, drawerOpen, closeDrawer, setQuantity, remove, maxQtyPerItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeDrawer();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen) return null;

  const go = (to) => {
    closeDrawer();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={closeDrawer} />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-lift">
        <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CartIcon width={19} height={19} /> Your cart
            {totals.itemCount > 0 && <span className="text-sm font-normal text-ink-500">({totals.itemCount})</span>}
          </h2>
          <button className="btn-ghost btn-sm" onClick={closeDrawer} aria-label="Close cart">
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-7 w-7 text-brand-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 items-center px-5">
            <EmptyState
              icon={CartIcon}
              title="Your cart is empty"
              description="Browse our lab-tested supplements and wellness essentials."
              action={
                <button className="btn-primary" onClick={() => go('/shop')}>
                  Start shopping
                </button>
              }
            />
          </div>
        ) : (
          <>
            {totals.amountToFreeShipping > 0 && (
              <div className="border-b border-ink-100 bg-brand-50/70 px-5 py-3">
                <p className="flex items-center gap-2 text-xs font-medium text-brand-800">
                  <TruckIcon width={16} height={16} />
                  Add {money(totals.amountToFreeShipping)} more for free delivery
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{
                      width: `${Math.min(100, ((totals.freeShippingAbove - totals.amountToFreeShipping) / totals.freeShippingAbove) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5">
              {items.map((line) => (
                <li key={line.id} className="flex gap-3 py-4">
                  <Link
                    to={`/product/${line.product.slug}`}
                    onClick={closeDrawer}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-50"
                  >
                    <ProductImage product={line.product} src={line.image} />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/product/${line.product.slug}`}
                      onClick={closeDrawer}
                      className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {line.product.name}
                    </Link>
                    {line.variantName && (
                      <p className="mt-0.5 text-xs font-medium text-brand-700">
                        {line.variantLabel || 'Option'}: {line.variantName}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-ink-500">{money(line.unitPrice)} each</p>
                    {!line.inStock && (
                      <p className="mt-1 text-xs font-medium text-rose-600">
                        {line.maxQuantity === 0 ? 'Out of stock' : `Only ${line.maxQuantity} left`}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border border-ink-200">
                        <button
                          className="px-2 py-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                          onClick={() => setQuantity(line, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon width={14} height={14} />
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold">{line.quantity}</span>
                        <button
                          className="px-2 py-1.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                          onClick={() => setQuantity(line, line.quantity + 1)}
                          disabled={line.quantity >= Math.min(line.maxQuantity, maxQtyPerItem)}
                          aria-label="Increase quantity"
                        >
                          <PlusIcon width={14} height={14} />
                        </button>
                      </div>

                      <span className="text-sm font-bold text-ink-950">{money(line.lineTotal)}</span>

                      <button
                        className="rounded p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => remove(line)}
                        aria-label={`Remove ${line.product.name}`}
                      >
                        <TrashIcon width={16} height={16} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-ink-100 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">Subtotal</dt>
                  <dd className="font-medium">{money(totals.subtotal)}</dd>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Discount {totals.couponCode && `(${totals.couponCode})`}</dt>
                    <dd className="font-medium">−{money(totals.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-600">Delivery</dt>
                  <dd className="font-medium">{totals.shippingFee === 0 ? 'Free' : money(totals.shippingFee)}</dd>
                </div>
                <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold text-ink-950">
                  <dt>Total</dt>
                  <dd>{money(totals.total)}</dd>
                </div>
              </dl>

              <button className="btn-primary mt-4 w-full py-3" onClick={() => go('/checkout')}>
                Checkout · {money(totals.total)}
              </button>
              <button className="btn-ghost mt-1.5 w-full" onClick={() => go('/cart')}>
                View full cart
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
