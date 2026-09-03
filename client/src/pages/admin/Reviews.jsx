import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, qs } from '../../api/client';
import { SearchIcon, StarIcon, TrashIcon } from '../../components/Icons';
import { ConfirmDialog, EmptyState, Pagination, Rating, Spinner, cx } from '../../components/ui';
import { dateShort } from '../../lib/format';
import { useDebounced, useFetch, useTitle } from '../../lib/hooks';

export default function AdminReviews() {
  useTitle('Reviews · Admin');

  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const q = useDebounced(search, 350);
  const { data: reviews, meta, loading, reload } = useFetch(`/admin/reviews${qs({ q, rating, page, limit: 20 })}`, [q, rating, page]);

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/admin/reviews/${deleting.id}`);
      toast.success('Review removed');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const total = meta?.breakdown?.reduce((n, b) => n + b.count, 0) ?? 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="mt-1 text-sm text-ink-500">
          Customer reviews shown on product pages. Removing one recalculates that product’s rating immediately.
        </p>
      </header>

      {meta?.breakdown && total > 0 && (
        <div className="card flex flex-wrap gap-6 p-4">
          {meta.breakdown.map(({ star, count }) => (
            <button
              key={star}
              onClick={() => {
                setRating(rating === String(star) ? '' : String(star));
                setPage(1);
              }}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                rating === String(star) ? 'bg-brand-700 text-white' : 'hover:bg-ink-100',
              )}
            >
              <span className="flex items-center gap-1 font-semibold">
                {star} <StarIcon width={13} height={13} className={rating === String(star) ? 'text-white' : 'text-brand-600'} />
              </span>
              <span className={rating === String(star) ? 'text-brand-100' : 'text-ink-500'}>{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={17} height={17} />
          <input
            className="input pl-10"
            placeholder="Search review text, product or customer"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : reviews?.length ? (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/admin/products/${review.product.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                    {review.product.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {review.user.name} · {review.user.email} · {dateShort(review.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Rating value={review.rating} />
                  <button
                    className="rounded p-1.5 text-ink-400 hover:bg-ink-200 hover:text-kupaa-black"
                    onClick={() => setDeleting(review)}
                    aria-label="Delete review"
                  >
                    <TrashIcon width={16} height={16} />
                  </button>
                </div>
              </div>

              {review.title && <p className="mt-2.5 text-sm font-semibold text-ink-900">{review.title}</p>}
              {review.comment && <p className="mt-1 text-sm leading-relaxed text-ink-600">{review.comment}</p>}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={StarIcon}
          title="No reviews match this filter"
          description="Only customers with a confirmed order for a product can review it."
        />
      )}

      <Pagination page={meta?.page ?? 1} pages={meta?.pages ?? 1} onChange={setPage} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete this review?"
        message={`The ${deleting?.rating}-star review by ${deleting?.user?.name} on ${deleting?.product?.name} will be removed and the product rating recalculated.`}
        confirmLabel="Delete review"
      />
    </div>
  );
}
