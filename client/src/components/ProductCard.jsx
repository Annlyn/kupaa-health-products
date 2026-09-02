import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, mediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { money, percentOff, priceRange } from '../lib/format';
import { CartIcon, ChevronRight, HeartIcon, ZoomIcon } from './Icons';
import { Rating, Spinner, cx } from './ui';
import Lightbox from './Lightbox';

/**
 * A product thumbnail. `src` overrides the product's own first image — cart and
 * order lines pass the chosen variant's photo through it.
 */
export function ProductImage({ product, src: override, className = '' }) {
  const src = mediaUrl(override || product.images?.[0]?.url);
  if (!src) {
    return (
      <div className={cx('flex items-center justify-center bg-ink-100 text-2xl font-display text-ink-400', className)}>
        {product.name?.[0] ?? '?'}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={(override ? null : product.images?.[0]?.alt) || product.name}
      loading="lazy"
      className={cx('h-full w-full object-cover', className)}
    />
  );
}

export default function ProductCard({ product, wishlisted, onWishlistChange }) {
  const { add } = useCart();
  const { isAuthenticated } = useAuth();
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(Boolean(wishlisted));
  const [zoomed, setZoomed] = useState(false);

  const images = product.images ?? [];

  const discount = percentOff(product.mrp, product.price);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= 5;
  // With several sizes the customer must choose one, so the card sends them to
  // the product page rather than guessing on their behalf.
  const needsChoice = Boolean(product.hasVariants);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await add(product, 1);
    } catch {
      /* toast already shown */
    } finally {
      setAdding(false);
    }
  };

  const handleWishlist = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return toast('Sign in to save items to your wishlist', { icon: '💚' });
    try {
      const { data } = await api.post(`/wishlist/${product.id}`);
      setSaved(data.wishlisted);
      onWishlistChange?.(product.id, data.wishlisted);
      toast.success(data.wishlisted ? 'Saved to wishlist' : 'Removed from wishlist');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <article className="group card flex flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-ink-50">
        {/* Tapping the photo opens it full size; the title and the button below
            are the way through to the product page. */}
        <button
          type="button"
          onClick={() => images.length && setZoomed(true)}
          disabled={!images.length}
          aria-label={`View full size image of ${product.name}`}
          className="block h-full w-full cursor-zoom-in"
        >
          <ProductImage product={product} className="transition duration-500 group-hover:scale-105" />
        </button>

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {discount > 0 && <span className="badge bg-rose-600 text-white shadow-sm">{discount}% off</span>}
          {product.isFeatured && <span className="badge bg-white/95 text-brand-800 shadow-sm">Bestseller</span>}
        </div>

        <button
          onClick={handleWishlist}
          aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={saved}
          className={cx(
            'absolute right-3 top-3 rounded-full p-2 shadow-sm backdrop-blur transition',
            saved ? 'bg-rose-600 text-white' : 'bg-white/90 text-ink-500 hover:text-rose-600',
          )}
        >
          <HeartIcon width={17} height={17} fill={saved ? 'currentColor' : 'none'} />
        </button>

        {images.length > 0 && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 p-1.5 text-ink-600 opacity-0 shadow-sm transition group-hover:opacity-100">
            <ZoomIcon width={15} height={15} />
          </span>
        )}

        {outOfStock && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="badge bg-ink-900 text-white">Out of stock</span>
          </div>
        )}
      </div>

      {zoomed && (
        <Lightbox
          images={images}
          onClose={() => setZoomed(false)}
          title={product.name}
          footer={
            <Link to={`/product/${product.slug}`} className="btn bg-white px-5 py-2.5 text-ink-900 hover:bg-brand-50">
              View product <ChevronRight width={15} height={15} />
            </Link>
          }
        />
      )}

      <div className="flex flex-1 flex-col p-4">
        {product.category && <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{product.category.name}</p>}

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
          <Link to={`/product/${product.slug}`} className="hover:text-brand-700">
            {product.name}
          </Link>
        </h3>

        {product.shortDesc && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{product.shortDesc}</p>}

        {product.ratingCount > 0 && <Rating value={product.ratingAvg} count={product.ratingCount} className="mt-2" />}

        <div className="mt-auto pt-3">
          <div className="flex items-baseline gap-2">
            {needsChoice && <span className="text-xs text-ink-500">from</span>}
            <span className="text-lg font-bold text-ink-950">{needsChoice ? priceRange(product) : money(product.price)}</span>
            {!needsChoice && product.mrp > product.price && (
              <span className="text-sm text-ink-400 line-through">{money(product.mrp)}</span>
            )}
          </div>

          {needsChoice ? (
            <p className="mt-1 text-xs text-ink-500">
              {product.variantCount} {(product.variantLabel || 'options').toLowerCase()} available
            </p>
          ) : (
            lowStock && <p className="mt-1 text-xs font-medium text-amber-600">Only {product.stock} left</p>
          )}

          {needsChoice ? (
            <Link to={`/product/${product.slug}`} className="btn-outline mt-3 w-full">
              Choose {(product.variantLabel || 'an option').toLowerCase()} <ChevronRight width={15} height={15} />
            </Link>
          ) : (
            <button onClick={handleAdd} disabled={outOfStock || adding} className="btn-primary mt-3 w-full">
              {adding ? <Spinner className="h-4 w-4" /> : <CartIcon width={16} height={16} />}
              {outOfStock ? 'Out of stock' : 'Add to cart'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
