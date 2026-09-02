import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, mediaUrl } from '../../api/client';
import ProductCard, { ProductImage } from '../../components/ProductCard';
import Lightbox from '../../components/Lightbox';
import {
  CartIcon,
  CheckCircle,
  HeartIcon,
  LeafIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  ShieldIcon,
  TruckIcon,
  ZoomIcon,
} from '../../components/Icons';
import { Breadcrumbs, EmptyState, PageLoader, Rating, Spinner, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import { dateShort, money, percentOff } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

function PincodeCheck({ weightKg }) {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pincode)) return toast.error('Enter a valid 6-digit PIN code');
    setBusy(true);
    try {
      const { data } = await api.get(`/shipping/serviceability?pincode=${pincode}&weight=${weightKg || 0.5}`);
      setResult(data);
    } catch (err) {
      toast.error(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <TruckIcon width={17} height={17} /> Check delivery to your area
      </p>
      <form onSubmit={check} className="mt-2.5 flex gap-2">
        <input
          className="input"
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit PIN code"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
          aria-label="Delivery PIN code"
        />
        <button className="btn-outline shrink-0" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : 'Check'}
        </button>
      </form>

      {result &&
        (result.serviceable ? (
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle width={16} height={16} /> Delivers to {result.pincode}
            </p>
            {result.fastest && (
              <p className="text-ink-600">
                Fastest: <span className="font-medium text-ink-900">{result.fastest.name}</span> · {result.fastest.etd || `${result.fastest.estimatedDays} days`}
              </p>
            )}
            <p className="text-xs text-ink-500">
              {result.freeShippingAbove > 0
                ? `Free delivery on orders above ${money(result.freeShippingAbove)}, otherwise ${money(result.flatShippingFee)}.`
                : `Delivery fee: ${money(result.flatShippingFee)}.`}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-rose-600">Sorry, we do not deliver to {result.pincode} yet.</p>
        ))}
    </div>
  );
}

function ReviewForm({ slug, onDone }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/products/${slug}/reviews`, { rating, title, comment });
      toast.success('Thanks for your review');
      setTitle('');
      setComment('');
      onDone?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="text-base font-semibold">Write a review</h3>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={cx('text-2xl transition', n <= rating ? 'text-amber-400' : 'text-ink-200 hover:text-amber-200')}
          >
            ★
          </button>
        ))}
      </div>

      <input className="input" placeholder="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      <textarea
        className="input min-h-24"
        placeholder="How did it work for you? Anything a future buyer should know?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1500}
      />
      <button className="btn-primary" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />} Submit review
      </button>
      <p className="hint">Only customers who have bought this product can post a review.</p>
    </form>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { data: product, loading, error, reload } = useFetch(`/products/${slug}`, [slug]);
  const { add } = useCart();
  const { isAuthenticated } = useAuth();
  const { maxQtyPerItem } = useStore();

  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState('description');

  useTitle(product?.name);

  /**
   * The gallery is the product's own photos plus any option photo that is not
   * already among them, so an option shot only ever used by one size still has
   * a thumbnail to switch back to.
   */
  const gallery = useMemo(() => {
    const images = [...(product?.images ?? [])];
    for (const variant of product?.variants ?? []) {
      if (variant.image && !images.some((img) => img.url === variant.image)) {
        images.push({ id: `variant-${variant.id}`, url: variant.image, alt: `${product.name} — ${variant.name}` });
      }
    }
    return images;
  }, [product]);

  // Default to the first in-stock option so the page is immediately actionable.
  useEffect(() => {
    if (!product?.variants?.length) return setVariantId(null);
    setVariantId((current) => {
      if (current && product.variants.some((v) => v.id === current)) return current;
      return (product.variants.find((v) => v.stock > 0) ?? product.variants[0]).id;
    });
  }, [product]);

  // Choosing an option jumps the gallery to that option's photo.
  useEffect(() => {
    const image = product?.variants?.find((v) => v.id === variantId)?.image;
    if (!image) return;
    const index = gallery.findIndex((img) => img.url === image);
    if (index >= 0) setActiveImage(index);
  }, [variantId, gallery, product]);

  if (loading) return <PageLoader label="Loading product" />;
  if (error || !product) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={PackageIcon}
          title="We could not find that product"
          description="It may have been renamed or discontinued."
          action={
            <Link to="/shop" className="btn-primary">
              Back to shop
            </Link>
          }
        />
      </div>
    );
  }

  const variants = product.variants ?? [];
  const selected = variants.find((v) => v.id === variantId) ?? null;

  // Everything below reads from the chosen option when there is one.
  const unitPrice = selected?.price ?? product.price;
  const unitMrp = selected?.mrp ?? product.mrp;
  const unitStock = selected?.stock ?? product.stock;
  const unitSku = selected?.sku ?? product.sku;
  const unitWeight = selected?.weightKg ?? product.weightKg;

  const discount = percentOff(unitMrp, unitPrice);
  const outOfStock = unitStock <= 0;
  const maxQty = Math.max(1, Math.min(unitStock, maxQtyPerItem));

  const handleAdd = async () => {
    setAdding(true);
    try {
      await add(product, quantity, variantId);
    } catch {
      /* toast shown */
    } finally {
      setAdding(false);
    }
  };

  const handleWishlist = async () => {
    if (!isAuthenticated) return toast('Sign in to save items to your wishlist', { icon: '💚' });
    try {
      const { data } = await api.post(`/wishlist/${product.id}`);
      toast.success(data.wishlisted ? 'Saved to wishlist' : 'Removed from wishlist');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Shop', to: '/shop' },
          ...(product.category ? [{ label: product.category.name, to: `/shop?category=${product.category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="group relative aspect-square overflow-hidden rounded-2xl border border-ink-100 bg-ink-50">
            {gallery[activeImage] ? (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="block h-full w-full cursor-zoom-in"
                aria-label="View full size image"
              >
                <img
                  src={mediaUrl(gallery[activeImage].url)}
                  alt={gallery[activeImage].alt || product.name}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm transition group-hover:bg-white">
                  <ZoomIcon width={14} height={14} /> Full size
                </span>
              </button>
            ) : (
              <ProductImage product={product} />
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {gallery.map((img, i) => (
                <button
                  key={img.id ?? i}
                  onClick={() => setActiveImage(i)}
                  aria-label={`View image ${i + 1}`}
                  aria-current={i === activeImage}
                  className={cx(
                    'h-20 w-20 overflow-hidden rounded-lg border-2 bg-ink-50 transition',
                    i === activeImage ? 'border-brand-600' : 'border-transparent hover:border-ink-200',
                  )}
                >
                  <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {zoomed && (
            <Lightbox
              images={gallery}
              index={activeImage}
              onIndexChange={setActiveImage}
              onClose={() => setZoomed(false)}
              title={selected ? `${product.name} — ${selected.name}` : product.name}
            />
          )}
        </div>

        <div>
          {product.category && (
            <Link to={`/shop?category=${product.category.slug}`} className="text-xs font-semibold uppercase tracking-wide text-brand-700 hover:underline">
              {product.category.name}
            </Link>
          )}

          <h1 className="mt-2 font-display text-3xl font-bold leading-tight">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {product.ratingCount > 0 ? (
              <Rating value={product.ratingAvg} count={product.ratingCount} size={16} />
            ) : (
              <span className="text-sm text-ink-400">No reviews yet</span>
            )}
            <span className="text-ink-200">|</span>
            <span className="text-xs text-ink-500">SKU {unitSku}</span>
          </div>

          {product.shortDesc && <p className="mt-4 text-base leading-relaxed text-ink-600">{product.shortDesc}</p>}

          {variants.length > 0 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-semibold text-ink-900">
                {product.variantLabel || 'Option'}
                {selected && <span className="ml-1.5 font-normal text-ink-500">· {selected.name}</span>}
              </legend>

              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const isSelected = variant.id === variantId;
                  const sold = variant.stock <= 0;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setVariantId(variant.id);
                        setQuantity(1);
                      }}
                      aria-pressed={isSelected}
                      className={cx(
                        'relative min-w-24 rounded-xl border-2 px-4 py-2.5 text-left transition',
                        isSelected ? 'border-brand-600 bg-brand-50/50' : 'border-ink-200 hover:border-ink-300',
                        sold && 'opacity-55',
                      )}
                    >
                      <span className="block text-sm font-semibold text-ink-900">{variant.name}</span>
                      <span className="block text-xs text-ink-600">{money(variant.price)}</span>
                      {sold && <span className="mt-0.5 block text-[10px] font-semibold uppercase text-rose-600">Sold out</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-6 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold text-ink-950">{money(unitPrice)}</span>
            {unitMrp > unitPrice && (
              <>
                <span className="text-lg text-ink-400 line-through">{money(unitMrp)}</span>
                <span className="badge bg-rose-50 text-rose-700">Save {discount}%</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">Inclusive of all taxes</p>

          <div className="mt-5">
            {outOfStock ? (
              <p className="text-sm font-semibold text-rose-600">
                {selected ? `${selected.name} is out of stock` : 'Currently out of stock'}
              </p>
            ) : unitStock <= 5 ? (
              <p className="text-sm font-semibold text-amber-600">Hurry — only {unitStock} left in stock</p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle width={16} height={16} /> In stock, dispatched within 24 hours
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-ink-200">
              <button
                className="px-3 py-2.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <MinusIcon width={16} height={16} />
              </button>
              <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
              <button
                className="px-3 py-2.5 text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label="Increase quantity"
              >
                <PlusIcon width={16} height={16} />
              </button>
            </div>

            <button className="btn-primary flex-1 py-3" onClick={handleAdd} disabled={outOfStock || adding}>
              {adding ? <Spinner className="h-4 w-4" /> : <CartIcon width={17} height={17} />}
              {outOfStock ? 'Out of stock' : `Add ${quantity}${selected ? ` × ${selected.name}` : ''} to cart`}
            </button>

            <button className="btn-outline py-3" onClick={handleWishlist} aria-label="Add to wishlist">
              <HeartIcon width={17} height={17} />
            </button>
          </div>

          <div className="mt-6">
            <PincodeCheck weightKg={unitWeight} />
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [ShieldIcon, 'Lab tested', 'Third-party assayed'],
              [LeafIcon, 'Clean label', 'No hidden fillers'],
              [PackageIcon, '7-day returns', 'On unopened packs'],
            ].map(([Icon, title, sub]) => (
              <li key={title} className="rounded-lg border border-ink-100 p-3">
                <Icon width={18} height={18} className="text-brand-700" />
                <p className="mt-1.5 text-xs font-semibold text-ink-900">{title}</p>
                <p className="text-[11px] text-ink-500">{sub}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-14">
        <div className="flex gap-1 border-b border-ink-100">
          {[
            ['description', 'Description'],
            ['details', 'Details & shipping'],
            ['reviews', `Reviews (${product.ratingCount})`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cx(
                '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition',
                tab === key ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="py-6">
          {tab === 'description' && (
            <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-ink-600">
              <p className="whitespace-pre-line">{product.description || product.shortDesc || 'Details coming soon.'}</p>
              {product.tags && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {product.tags.split(',').map((tag) => (
                    <Link key={tag} to={`/shop?q=${encodeURIComponent(tag.trim())}`} className="badge bg-ink-100 text-ink-600 hover:bg-ink-200">
                      {tag.trim()}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'details' && (
            <dl className="grid max-w-2xl gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ['SKU', unitSku],
                ...(selected ? [[product.variantLabel || 'Option', selected.name]] : []),
                ['Category', product.category?.name ?? '—'],
                ['Net weight', `${unitWeight} kg`],
                ['Pack dimensions', `${product.lengthCm} × ${product.breadthCm} × ${product.heightCm} cm`],
                ['HSN code', product.hsn || '—'],
                ['Dispatch', 'Within 24 hours of confirmation'],
                ['Delivery', 'Typically 2–5 business days across India'],
                ['Returns', '7 days on unopened packs'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-ink-50 py-2">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-right font-medium text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {tab === 'reviews' && (
            <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
              <div>
                <div className="card p-5">
                  <p className="text-4xl font-bold text-ink-950">{product.ratingAvg || '—'}</p>
                  <Rating value={product.ratingAvg} size={16} className="mt-1.5" />
                  <p className="mt-1 text-xs text-ink-500">Based on {product.ratingCount} review(s)</p>

                  <div className="mt-4 space-y-1.5">
                    {product.ratingBreakdown?.map(({ star, count }) => (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-ink-500">{star}★</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${product.ratingCount ? (count / product.ratingCount) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-ink-500">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {isAuthenticated ? (
                  <div className="mt-4">
                    <ReviewForm slug={slug} onDone={reload} />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-ink-500">
                    <Link to="/login" className="font-semibold text-brand-700 hover:underline">
                      Sign in
                    </Link>{' '}
                    to write a review.
                  </p>
                )}
              </div>

              <div>
                {product.reviews?.length ? (
                  <ul className="space-y-5">
                    {product.reviews.map((r) => (
                      <li key={r.id} className="border-b border-ink-50 pb-5 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink-900">{r.author}</p>
                          <span className="text-xs text-ink-400">{dateShort(r.createdAt)}</span>
                        </div>
                        <Rating value={r.rating} className="mt-1" />
                        {r.title && <p className="mt-2 text-sm font-semibold text-ink-900">{r.title}</p>}
                        {r.comment && <p className="mt-1 text-sm leading-relaxed text-ink-600">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No reviews yet" description="Be the first to share how this worked for you." />
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {product.related?.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">You might also like</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
