import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';

export default function NotFound() {
  useTitle('Page not found');

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-display text-7xl font-bold text-brand-200">404</p>
      <h1 className="mt-4 text-2xl font-bold">We could not find that page</h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        The link may be out of date, or the product may have been discontinued.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-primary">
          Back to home
        </Link>
        <Link to="/shop" className="btn-outline">
          Browse products
        </Link>
      </div>
    </div>
  );
}
