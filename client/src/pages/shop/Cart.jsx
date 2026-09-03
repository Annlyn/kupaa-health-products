import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ProductImage } from '../../components/ProductCard';
import { CartIcon, MinusIcon, PlusIcon, TagIcon, TrashIcon, TruckIcon } from '../../components/Icons';
import { Breadcrumbs, EmptyState, PageLoader, Spinner } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { money } from '../../lib/format';
import { useTitle } from '../../lib/hooks';

export default function Cart() {
  useTitle('Your cart');
  const { items, totals, loading, coupon, setQuantity, remove, clear, applyCoupon, removeCoupon, maxQtyPerItem } = useCart();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  const submitCoupon = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setApplying(true);
    try {
      await applyCoupon(code);
      setCode('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <PageLoader label="Loading your cart" />;

  const hasIssues = items.some((line) => !line.inStock);

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Your cart</h1>

      {items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={CartIcon}
            title="Your cart is empty"
            description="Add a few essentials and they will show up here."
            action={
              <Link to="/shop" className="btn-primary">
                Browse products
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="card divide-y divide-ink-100">
              {items.map((line) => (
                <article key={line.id} className="flex gap-4 p-4">
                  <Link to={`/product/${line.product.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                    <ProductImage product={line.product} src={line.image} />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-4">
                      <div className="min-w-0">
                        <Link to={`/product/${line.product.slug}`} className="line-clamp-2 font-semibold text-ink-900 hover:text-brand-700">
                          {line.product.name}
                        </Link>
                        {line.variantName && (
                          <p className="mt-0.5 text-xs font-medium text-brand-700">
                            {line.variantLabel || 'Option'}: {line.variantName}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-ink-500">SKU {line.sku}</p>
                        {!line.inStock && (
                          <p className="mt-1.5 text-xs font-semibold text-ink-500">
                            {line.maxQuantity === 0 ? 'Out of stock — remove to continue' : `Only ${line.maxQuantity} available`}
                          </p>
                        )}
                      </div>
                      <button
                        className="h-fit rounded p-1.5 text-ink-400 hover:bg-ink-200 hover:text-kupaa-black"
                        onClick={() => remove(line)}
                        aria-label={`Remove ${line.product.name}`}
                      >
                        <TrashIcon width={17} height={17} />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg border border-ink-200">
                        <button
                          className="px-2.5 py-2 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                          onClick={() => setQuantity(line, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon width={15} height={15} />
                        </button>
                        <span className="min-w-9 text-center text-sm font-semibold">{line.quantity}</span>
                        <button
                          className="px-2.5 py-2 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                          onClick={() => setQuantity(line, line.quantity + 1)}
                          disabled={line.quantity >= Math.min(line.maxQuantity, maxQtyPerItem)}
                          aria-label="Increase quantity"
                        >
                          <PlusIcon width={15} height={15} />
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-ink-950">{money(line.lineTotal)}</p>
                        <p className="text-xs text-ink-500">{money(line.unitPrice)} each</p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-3">
              <Link to="/shop" className="btn-ghost">
                ← Continue shopping
              </Link>
              <button className="btn-ghost text-kupaa-black hover:bg-ink-200" onClick={clear}>
                Clear cart
              </button>
            </div>
          </section>

          <aside className="lg:sticky lg:top-40 lg:h-fit">
            <div className="card p-5">
              <h2 className="text-lg font-semibold">Order summary</h2>

              <form onSubmit={submitCoupon} className="mt-4">
                {totals.couponCode ? (
                  <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-brand-800">
                      <TagIcon width={16} height={16} /> {totals.couponCode}
                    </span>
                    <button type="button" onClick={removeCoupon} className="text-xs font-medium text-brand-700 underline">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="Coupon code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      aria-label="Coupon code"
                    />
                    <button className="btn-outline shrink-0" disabled={applying || !code.trim()}>
                      {applying ? <Spinner className="h-4 w-4" /> : 'Apply'}
                    </button>
                  </div>
                )}
                {!totals.couponCode && !coupon && <p className="hint">Try WELCOME10 for 10% off your first order.</p>}
              </form>

              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">Subtotal ({totals.itemCount} items)</dt>
                  <dd className="font-medium">{money(totals.subtotal)}</dd>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <dt>Discount</dt>
                    <dd className="font-medium">−{money(totals.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-600">Delivery</dt>
                  <dd className="font-medium">{totals.shippingFee === 0 ? 'Free' : money(totals.shippingFee)}</dd>
                </div>
                {totals.tax > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-600">Tax ({totals.taxPercent}%)</dt>
                    <dd className="font-medium">{money(totals.tax)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-ink-100 pt-3 text-lg font-bold text-ink-950">
                  <dt>Total</dt>
                  <dd>{money(totals.total)}</dd>
                </div>
              </dl>

              {totals.amountToFreeShipping > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
                  <TruckIcon width={15} height={15} className="mt-0.5 shrink-0" />
                  Add {money(totals.amountToFreeShipping)} more to qualify for free delivery.
                </p>
              )}

              <button className="btn-primary mt-5 w-full py-3" onClick={() => navigate('/checkout')} disabled={hasIssues}>
                Proceed to checkout
              </button>
              {hasIssues && <p className="error-text text-center">Update the highlighted items before checking out.</p>}

              <p className="mt-3 text-center text-xs text-ink-400">Secure payments via Razorpay · UPI, cards, netbanking & COD</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
