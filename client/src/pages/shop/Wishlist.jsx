import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import { HeartIcon } from '../../components/Icons';
import { Breadcrumbs, EmptyState, SkeletonCard } from '../../components/ui';
import { useFetch, useTitle } from '../../lib/hooks';

export default function Wishlist() {
  useTitle('Your wishlist');
  const { data: products, loading, setData } = useFetch('/wishlist');

  const handleChange = (productId, wishlisted) => {
    if (!wishlisted) setData((products || []).filter((p) => p.id !== productId));
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Your wishlist</h1>
      <p className="mt-1.5 text-sm text-ink-500">Saved for later — we will keep an eye on stock for you.</p>

      <div className="mt-7">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products?.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} wishlisted onWishlistChange={handleChange} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={HeartIcon}
            title="Nothing saved yet"
            description="Tap the heart on any product to keep it here for later."
            action={
              <Link to="/shop" className="btn-primary">
                Browse products
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
