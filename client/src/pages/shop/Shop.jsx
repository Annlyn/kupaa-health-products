import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import { CloseIcon, FilterIcon, SearchIcon } from '../../components/Icons';
import { Breadcrumbs, EmptyState, Pagination, SkeletonCard, cx } from '../../components/ui';
import { useFetch, useTitle } from '../../lib/hooks';
import { money } from '../../lib/format';
import { qs } from '../../api/client';

const SORTS = [
  ['newest', 'Newest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['name', 'Name A–Z'],
];

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = {
    q: params.get('q') || '',
    category: params.get('category') || '',
    sort: params.get('sort') || 'newest',
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || '',
    inStock: params.get('inStock') || '',
    featured: params.get('featured') || '',
    page: Number(params.get('page') || 1),
  };

  const { data: facets } = useFetch('/products/facets');
  const path = useMemo(() => `/products${qs({ ...query, limit: 12 })}`, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: products, meta, loading } = useFetch(path);

  const [priceDraft, setPriceDraft] = useState({ min: query.minPrice, max: query.maxPrice });
  useEffect(() => {
    setPriceDraft({ min: query.minPrice, max: query.maxPrice });
  }, [query.minPrice, query.maxPrice]);

  const activeCategory = facets?.categories?.find((c) => c.slug === query.category);
  useTitle(query.q ? `Search: ${query.q}` : activeCategory ? activeCategory.name : 'Shop all products');

  /** Any filter change resets pagination — page 3 of the old result set is meaningless. */
  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const activeFilters = [
    activeCategory && { key: 'category', label: activeCategory.name },
    query.q && { key: 'q', label: `“${query.q}”` },
    query.inStock === 'true' && { key: 'inStock', label: 'In stock only' },
    query.featured === 'true' && { key: 'featured', label: 'Bestsellers' },
    (query.minPrice || query.maxPrice) && {
      key: 'price',
      label: `${money(query.minPrice || facets?.priceMin || 0)} – ${money(query.maxPrice || facets?.priceMax || 0)}`,
    },
  ].filter(Boolean);

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const filterPanel = (
    <div className="space-y-7">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">Category</h3>
        <ul className="mt-3 space-y-1">
          <li>
            <button
              onClick={() => setFilter({ category: '' })}
              className={cx(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition',
                !query.category ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              All products
            </button>
          </li>
          {(facets?.categories || []).map((cat) => (
            <li key={cat.id}>
              <button
                onClick={() => setFilter({ category: cat.slug })}
                className={cx(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                  query.category === cat.slug ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-600 hover:bg-ink-50',
                )}
              >
                <span className="truncate">{cat.name}</span>
                <span className="text-xs text-ink-400">{cat.productCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink-900">Price range</h3>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            className="input"
            placeholder={String(facets?.priceMin ?? 0)}
            value={priceDraft.min}
            onChange={(e) => setPriceDraft((p) => ({ ...p, min: e.target.value }))}
            aria-label="Minimum price"
          />
          <span className="text-ink-400">–</span>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            placeholder={String(facets?.priceMax ?? 0)}
            value={priceDraft.max}
            onChange={(e) => setPriceDraft((p) => ({ ...p, max: e.target.value }))}
            aria-label="Maximum price"
          />
        </div>
        <button className="btn-secondary mt-2.5 w-full btn-sm" onClick={() => setFilter({ minPrice: priceDraft.min, maxPrice: priceDraft.max })}>
          Apply price
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink-900">Refine</h3>
        <div className="mt-3 space-y-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={query.inStock === 'true'}
              onChange={(e) => setFilter({ inStock: e.target.checked ? 'true' : '' })}
            />
            In stock only
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={query.featured === 'true'}
              onChange={(e) => setFilter({ featured: e.target.checked ? 'true' : '' })}
            />
            Bestsellers only
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, ...(activeCategory ? [{ label: activeCategory.name }] : [])]}
      />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {query.q ? `Results for “${query.q}”` : activeCategory ? activeCategory.name : 'All products'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            {loading ? 'Loading…' : `${meta?.total ?? 0} product${meta?.total === 1 ? '' : 's'}`}
            {activeCategory?.description ? ` · ${activeCategory.description}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-outline lg:hidden" onClick={() => setFiltersOpen(true)}>
            <FilterIcon width={16} height={16} /> Filters
          </button>
          <label className="sr-only" htmlFor="sort">
            Sort by
          </label>
          <select id="sort" className="input w-auto py-2" value={query.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {activeFilters.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key === 'price' ? { minPrice: '', maxPrice: '' } : { [f.key]: '' })}
              className="badge bg-brand-50 text-brand-800 hover:bg-brand-100"
            >
              {f.label} <CloseIcon width={12} height={12} />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs font-medium text-ink-500 underline hover:text-ink-800">
            Clear all
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-40">{filterPanel}</div>
        </aside>

        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink-950/40" onClick={() => setFiltersOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-80 max-w-[88vw] overflow-y-auto bg-white p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Filters</h2>
                <button className="btn-ghost btn-sm" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                  <CloseIcon width={18} height={18} />
                </button>
              </div>
              {filterPanel}
              <button className="btn-primary mt-6 w-full" onClick={() => setFiltersOpen(false)}>
                Show {meta?.total ?? 0} results
              </button>
            </div>
          </div>
        )}

        <div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : products?.length ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <Pagination page={meta.page} pages={meta.pages} onChange={(page) => setFilter({ page })} className="mt-10" />
            </>
          ) : (
            <EmptyState
              icon={SearchIcon}
              title="Nothing matched those filters"
              description="Try widening the price range, clearing the search term, or browsing a different category."
              action={
                <button className="btn-primary" onClick={clearAll}>
                  Clear filters
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
