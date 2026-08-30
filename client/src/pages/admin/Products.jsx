import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, mediaUrl, qs } from '../../api/client';
import { CopyIcon, EditIcon, PackageIcon, PlusIcon, SearchIcon, TrashIcon } from '../../components/Icons';
import { Badge, ConfirmDialog, EmptyState, Modal, Pagination, Spinner, cx } from '../../components/ui';
import { money, percentOff } from '../../lib/format';
import { useDebounced, useFetch, useTitle } from '../../lib/hooks';

const STATUS_TABS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['inactive', 'Archived'],
  ['low', 'Low stock'],
  ['out', 'Out of stock'],
];

export default function AdminProducts() {
  useTitle('Products · Admin');

  // Filters live in the URL so a filtered view is linkable, survives a refresh
  // and works with the back button — and so "select all" means what it says.
  const [params, setParams] = useSearchParams();
  const search0 = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState(search0);
  useEffect(() => {
    if (search0 !== search) setSearch(search0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search0]);

  const q = useDebounced(search, 350);

  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null || v === 'all' || (k === 'page' && Number(v) === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Keep the debounced search term in the URL without a history entry per keystroke.
  useEffect(() => {
    if (q === search0) return;
    setFilter({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setPage = (value) => setFilter({ page: value });
  const { data: categories } = useFetch('/admin/categories');
  const path = `/admin/products${qs({ q, status, category, sort, page, limit: 20 })}`;
  const { data: products, meta, loading, reload } = useFetch(path, [q, status, category, sort, page]);

  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stockEdit, setStockEdit] = useState({});

  const [selected, setSelected] = useState([]);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState('10');

  // A page change or new filter invalidates the old selection.
  useEffect(() => {
    setSelected([]);
  }, [path]);

  const visibleIds = useMemo(() => (products ?? []).map((p) => p.id), [products]);
  const selectedProducts = useMemo(() => (products ?? []).filter((p) => selected.includes(p.id)), [products, selected]);
  const archiveCount = selectedProducts.filter((p) => (p._count?.orderItems ?? 0) > 0).length;
  const permanentCount = selectedProducts.length - archiveCount;
  const allSelected = visibleIds.length > 0 && selected.length === visibleIds.length;

  const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(allSelected ? [] : visibleIds);

  const remove = async (force = false) => {
    setBusy(true);
    try {
      const { data } = await api.del(`/admin/products/${deleting.id}${force ? '?force=true' : ''}`);
      toast.success(data.message || 'Product deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (product) => {
    try {
      const { data } = await api.post(`/admin/products/${product.id}/duplicate`);
      toast.success(`Copied as “${data.name}” — hidden until you publish it`);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /** One call for the whole selection; the server reports what it did. */
  const runBulk = async (action, value) => {
    setBusy(true);
    try {
      const { data } = await api.post('/admin/products/bulk', { ids: selected, action, value, force: forceDelete });
      const parts = [
        data.updated ? `${data.updated} updated` : null,
        data.archived ? `${data.archived} archived (they appear in orders)` : null,
        data.deleted ? `${data.deleted} deleted` : null,
      ].filter(Boolean);
      toast.success(parts.join(' · ') || 'Nothing to change');
      setSelected([]);
      setBulkDelete(false);
      setForceDelete(false);
      setDiscountOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveStock = async (product) => {
    const value = stockEdit[product.id];
    if (value === undefined || Number(value) === product.stock) return setStockEdit((s) => ({ ...s, [product.id]: undefined }));

    try {
      await api.patch(`/admin/products/${product.id}/stock`, { stock: Number(value) });
      toast.success(`Stock updated for ${product.name}`);
      setStockEdit((s) => ({ ...s, [product.id]: undefined }));
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-ink-500">
            {meta?.total ?? 0} products. Edit stock inline, or tick rows to change several at once.
          </p>
        </div>
        <Link to="/admin/products/new" className="btn-primary">
          <PlusIcon width={16} height={16} /> Add product
        </Link>
      </header>

      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={17} height={17} />
            <input
              className="input pl-10"
              placeholder="Search by name, SKU or tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select className="input w-auto" value={category} onChange={(e) => setFilter({ category: e.target.value })}>
            <option value="">All categories</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select className="input w-auto" value={sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="price_asc">Price low → high</option>
            <option value="price_desc">Price high → low</option>
            <option value="stock">Stock low → high</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_TABS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter({ status: value })}
              className={cx('badge', status === value ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-card">
          <span className="text-sm font-semibold text-brand-900">
            {selected.length} selected
          </span>
          <button className="btn-ghost btn-sm text-brand-800" onClick={() => setSelected([])}>
            Clear
          </button>

          <span className="mx-1 h-5 w-px bg-brand-200" />

          <button className="btn-outline btn-sm" onClick={() => setDiscountOpen(true)} disabled={busy}>
            Apply discount
          </button>
          <button className="btn-outline btn-sm" onClick={() => runBulk('clearDiscount')} disabled={busy}>
            Clear discount
          </button>
          <button className="btn-outline btn-sm" onClick={() => runBulk('activate')} disabled={busy}>
            Activate
          </button>
          <button className="btn-outline btn-sm" onClick={() => runBulk('deactivate')} disabled={busy}>
            Archive
          </button>
          <button className="btn-outline btn-sm" onClick={() => runBulk('feature')} disabled={busy}>
            Feature
          </button>
          <button className="btn-outline btn-sm" onClick={() => runBulk('unfeature')} disabled={busy}>
            Unfeature
          </button>
          <button className="btn-danger btn-sm" onClick={() => setBulkDelete(true)} disabled={busy}>
            Delete
          </button>
          {busy && <Spinner className="h-4 w-4 text-brand-700" />}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : products?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all products on this page"
                  />
                </th>
                <th>Product</th>
                <th>Category</th>
                <th className="text-right">Price</th>
                <th className="text-center">Stock</th>
                <th className="text-center">Status</th>
                <th className="text-center">Sold</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const discount = percentOff(product.mrp, product.price);
                return (
                  <tr key={product.id} className={cx(selected.includes(product.id) && 'bg-brand-50/60')}>
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        checked={selected.includes(product.id)}
                        onChange={() => toggleOne(product.id)}
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                          {product.images?.[0] ? (
                            <img src={mediaUrl(product.images[0].url)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-ink-400">
                              <PackageIcon width={17} height={17} />
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <Link to={`/admin/products/${product.id}`} className="line-clamp-1 font-medium text-ink-900 hover:text-brand-700">
                            {product.name}
                          </Link>
                          <p className="text-xs text-ink-500">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm">{product.category?.name ?? '—'}</td>
                    <td className="text-right">
                      <p className="font-semibold">{money(product.price)}</p>
                      {discount > 0 && (
                        <p className="text-xs text-ink-400">
                          <span className="line-through">{money(product.mrp)}</span>{' '}
                          <span className="font-medium text-emerald-600">−{discount}%</span>
                        </p>
                      )}
                    </td>
                    <td className="text-center">
                      <input
                        type="number"
                        min={0}
                        className={cx(
                          'w-20 rounded-md border px-2 py-1 text-center text-sm',
                          product.stock === 0
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : product.stock <= product.lowStockAt
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-ink-200',
                        )}
                        value={stockEdit[product.id] ?? product.stock}
                        onChange={(e) => setStockEdit((s) => ({ ...s, [product.id]: e.target.value }))}
                        onBlur={() => saveStock(product)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        aria-label={`Stock for ${product.name}`}
                      />
                    </td>
                    <td className="text-center">
                      <Badge className={product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600'}>
                        {product.isActive ? 'Active' : 'Archived'}
                      </Badge>
                      {product.isFeatured && <Badge className="ml-1 bg-amber-50 text-amber-700">Featured</Badge>}
                    </td>
                    <td className="text-center text-sm text-ink-600">{product._count?.orderItems ?? 0}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link to={`/admin/products/${product.id}`} className="btn-ghost btn-sm" aria-label={`Edit ${product.name}`}>
                          <EditIcon width={16} height={16} />
                        </Link>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => duplicate(product)}
                          aria-label={`Duplicate ${product.name}`}
                          title="Duplicate"
                        >
                          <CopyIcon width={16} height={16} />
                        </button>
                        <button
                          className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
                          onClick={() => setDeleting(product)}
                          aria-label={`Delete ${product.name}`}
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={PackageIcon}
          title="No products match these filters"
          description="Try a different search term, or add your first product."
          action={
            <Link to="/admin/products/new" className="btn-primary">
              Add product
            </Link>
          }
        />
      )}

      <Pagination page={meta?.page ?? 1} pages={meta?.pages ?? 1} onChange={setPage} />

      {deleting && (deleting._count?.orderItems ?? 0) > 0 ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={`Remove “${deleting.name}”?`}
          size="sm"
          footer={
            <>
              <button className="btn-outline" onClick={() => setDeleting(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn-outline" onClick={() => remove(false)} disabled={busy}>
                Archive
              </button>
              <button className="btn-danger" onClick={() => remove(true)} disabled={busy}>
                {busy && <Spinner className="h-4 w-4" />} Delete permanently
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-600">
            This product appears in <strong>{deleting._count.orderItems} past order(s)</strong>.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>
              <strong className="text-ink-900">Archive</strong> — hides it from the store but keeps it in your product list and
              linked from those orders. You can re-activate it later.
            </li>
            <li>
              <strong className="text-ink-900">Delete permanently</strong> — removes it from the list for good. Those orders keep
              the name, SKU and price they were placed with, so invoices and history still read correctly; they just stop linking
              to a product page.
            </li>
          </ul>
        </Modal>
      ) : (
        <ConfirmDialog
          open={Boolean(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove(false)}
          busy={busy}
          title="Delete this product?"
          message={`${deleting?.name} will be removed from the store. This cannot be undone.`}
          confirmLabel="Delete product"
        />
      )}

      <Modal
        open={bulkDelete}
        onClose={() => {
          setBulkDelete(false);
          setForceDelete(false);
        }}
        title={`Remove ${selected.length} product(s)?`}
        size="sm"
        footer={
          <>
            <button
              className="btn-outline"
              onClick={() => {
                setBulkDelete(false);
                setForceDelete(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="btn-danger" onClick={() => runBulk('delete')} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} {forceDelete ? 'Delete all permanently' : `Remove ${selected.length}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          {selectedProducts
            .slice(0, 6)
            .map((p) => p.name)
            .join(', ')}
          {selectedProducts.length > 6 ? `, and ${selectedProducts.length - 6} more` : ''}.
        </p>

        {archiveCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {archiveCount} of these appear in past orders. By default they are archived rather than deleted.
          </p>
        )}

        <p className="mt-3 text-sm text-ink-600">
          {permanentCount > 0 && `${permanentCount} will be deleted permanently. `}
          This cannot be undone.
        </p>

        {archiveCount > 0 && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-rose-600 focus:ring-rose-500"
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
            />
            <span>
              Delete all {selected.length} permanently, including the ones with orders. Past orders keep the name, SKU and price
              they were placed with.
            </span>
          </label>
        )}
      </Modal>

      <Modal
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        title={`Discount ${selected.length} product(s)`}
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDiscountOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => runBulk('discount', Number(discountPct))} disabled={busy || !(Number(discountPct) > 0)}>
              {busy && <Spinner className="h-4 w-4" />} Apply {discountPct || 0}% off
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Each product’s selling price is recalculated from its own MRP, so items keep their individual pricing. Use{' '}
          <strong>Clear discount</strong> to put prices back to MRP.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative w-28">
            <input
              type="number"
              min="1"
              max="99"
              className="input pr-7"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              aria-label="Discount percentage"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">%</span>
          </div>
          {[10, 20, 30, 50].map((pct) => (
            <button key={pct} type="button" className="btn-outline btn-sm" onClick={() => setDiscountPct(String(pct))}>
              {pct}%
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
