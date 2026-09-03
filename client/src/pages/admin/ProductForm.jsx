import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, mediaUrl } from '../../api/client';
import { CopyIcon, ImageIcon, PlusIcon, TrashIcon } from '../../components/Icons';
import { Field, PageLoader, Spinner, cx } from '../../components/ui';
import { money, percentOff } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

const BLANK = {
  name: '',
  slug: '',
  sku: '',
  shortDesc: '',
  description: '',
  categoryId: '',
  price: '',
  mrp: '',
  stock: 0,
  lowStockAt: 5,
  weightKg: 0.3,
  lengthCm: 15,
  breadthCm: 10,
  heightCm: 5,
  hsn: '',
  tags: '',
  isActive: true,
  isFeatured: false,
  images: [],
  variantLabel: '',
  variants: [],
};

const BLANK_VARIANT = {
  id: null,
  name: '',
  sku: '',
  price: '',
  mrp: '',
  stock: 0,
  weightKg: 0.3,
  lengthCm: 15,
  breadthCm: 10,
  heightCm: 5,
  image: '',
  isActive: true,
};

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const fileRef = useRef(null);

  useTitle(isEdit ? 'Edit product · Admin' : 'New product · Admin');

  const { data: categories } = useFetch('/admin/categories');
  const { data: existing, loading } = useFetch(isEdit ? `/admin/products/${id}` : null, [id]);

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [discountDraft, setDiscountDraft] = useState('');
  const [draggedImage, setDraggedImage] = useState(null);

  useEffect(() => {
    if (!existing) return;
    setForm({
      ...BLANK,
      ...existing,
      categoryId: existing.categoryId || '',
      shortDesc: existing.shortDesc || '',
      description: existing.description || '',
      hsn: existing.hsn || '',
      tags: existing.tags || '',
      images: existing.images?.map((i) => ({ url: i.url, alt: i.alt || '', showInCarousel: Boolean(i.showInCarousel) })) || [],
      variantLabel: existing.variantLabel || '',
      variants:
        existing.variants?.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          mrp: v.mrp,
          stock: v.stock,
          weightKg: v.weightKg,
          lengthCm: Number(v.lengthCm),
          breadthCm: Number(v.breadthCm),
          heightCm: Number(v.heightCm),
          image: v.image || '',
          isActive: v.isActive,
        })) || [],
    });
    setDiscountDraft(existing.mrp > existing.price ? String(percentOff(existing.mrp, existing.price)) : '');
  }, [existing]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  /** Typing a discount percentage rewrites the selling price from the MRP. */
  const applyDiscount = (percent) => {
    const mrp = Number(form.mrp);
    const pct = Number(percent);
    if (!(mrp > 0) || !Number.isFinite(pct)) return;
    const clamped = Math.min(99, Math.max(0, pct));
    setForm((f) => ({ ...f, price: Math.max(1, Math.round(mrp * (100 - clamped)) / 100) }));
    setErrors((p) => ({ ...p, price: undefined, mrp: undefined }));
  };

  const duplicate = async () => {
    setDuplicating(true);
    try {
      const { data } = await api.post(`/admin/products/${id}/duplicate`);
      toast.success('Copy created as a hidden draft');
      navigate(`/admin/products/${data.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDuplicating(false);
    }
  };

  const upload = async (files) => {
    const picked = [...(files ?? [])];
    if (!picked.length) return;

    const room = 8 - form.images.length;
    if (room <= 0) {
      if (fileRef.current) fileRef.current.value = '';
      return toast.error('A product can have at most 8 images. Remove one first.');
    }
    if (picked.length > room) toast(`Only ${room} more image(s) fit — the rest were skipped.`, { icon: 'ℹ️' });

    setUploading(true);
    try {
      const body = new FormData();
      picked.slice(0, room).forEach((file) => body.append('images', file));

      const { data } = await api.post('/admin/upload', body);
      if (!data?.length) throw new Error('The server did not return an image. Please try a different file.');

      setForm((f) => ({
        ...f,
        images: [...f.images, ...data.map((d) => ({ url: d.url, alt: '', showInCarousel: true }))].slice(0, 8),
      }));
      toast.success(`${data.length} image${data.length > 1 ? 's' : ''} uploaded — save to keep the change`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hasVariants = form.variants.length > 0;

  const moveImage = (from, to) => {
    if (from === to || from == null || to == null || from < 0 || to < 0 || from >= form.images.length || to >= form.images.length) return;
    setForm((f) => {
      const images = [...f.images];
      const [image] = images.splice(from, 1);
      images.splice(to, 0, image);
      return { ...f, images };
    });
  };

  const setVariant = (index, key, value) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, [key]: value } : v)) }));

  const addVariant = () =>
    setForm((f) => ({
      ...f,
      // Seed a new option from the product's own numbers so it needs less typing.
      variants: [
        ...f.variants,
        {
          ...BLANK_VARIANT,
          sku: f.sku ? `${f.sku}-${f.variants.length + 1}` : '',
          price: f.price,
          mrp: f.mrp,
          weightKg: f.weightKg,
          lengthCm: f.lengthCm,
          breadthCm: f.breadthCm,
          heightCm: f.heightCm,
        },
      ],
      variantLabel: f.variantLabel || 'Size',
    }));

  const removeVariant = (index) => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter a product name';
    if (!form.sku.trim()) next.sku = 'SKU is required';
    if (!(Number(form.weightKg) > 0)) next.weightKg = 'Weight is required for shipping';

    if (hasVariants) {
      if (!form.variantLabel.trim()) next.variantLabel = 'Name the option type, e.g. Weight or Size';

      const names = form.variants.map((v) => v.name.trim().toLowerCase());
      const skus = form.variants.map((v) => v.sku.trim().toLowerCase());

      if (form.variants.some((v) => !v.name.trim())) next.variants = 'Every option needs a name';
      else if (form.variants.some((v) => !v.sku.trim())) next.variants = 'Every option needs its own SKU';
      else if (form.variants.some((v) => !(Number(v.price) > 0))) next.variants = 'Every option needs a price';
      else if (form.variants.some((v) => Number(v.mrp) < Number(v.price))) next.variants = 'An option has an MRP below its price';
      else if (form.variants.some((v) => !(Number(v.weightKg) > 0 && Number(v.lengthCm) > 0 && Number(v.breadthCm) > 0 && Number(v.heightCm) > 0))) {
        next.variants = 'Every option needs packed dimensions';
      }
      else if (new Set(names).size !== names.length) next.variants = 'Two options share the same name';
      else if (new Set(skus).size !== skus.length) next.variants = 'Two options share the same SKU';
    } else {
      if (!(Number(form.price) > 0)) next.price = 'Enter a selling price';
      if (!(Number(form.mrp) >= Number(form.price))) next.mrp = 'MRP must be at least the selling price';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.error('Please fix the highlighted fields');

    setSaving(true);
    try {
      const payload = {
        ...form,
        // With options, these product columns become maintained aggregates —
        // the server recomputes them from the cheapest active option.
        price: hasVariants ? Number(form.variants[0].price) : Number(form.price),
        mrp: hasVariants ? Number(form.variants[0].mrp) : Number(form.mrp),
        stock: hasVariants ? 0 : Number(form.stock),
        variantLabel: hasVariants ? form.variantLabel.trim() : null,
        variants: form.variants.map((v) => ({
          id: v.id ?? undefined,
          name: v.name.trim(),
          sku: v.sku.trim(),
          price: Number(v.price),
          mrp: Number(v.mrp),
          stock: Number(v.stock),
          weightKg: Number(v.weightKg),
          image: v.image || null,
          isActive: Boolean(v.isActive),
        })),
        lowStockAt: Number(form.lowStockAt),
        weightKg: Number(form.weightKg),
        lengthCm: Number(form.lengthCm),
        breadthCm: Number(form.breadthCm),
        heightCm: Number(form.heightCm),
        categoryId: form.categoryId || null,
      };
      // The API derives these; sending them back would be rejected.
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.ratingAvg;
      delete payload.ratingCount;
      delete payload.category;
      delete payload.variantCount;

      if (isEdit) await api.put(`/admin/products/${id}`, payload);
      else await api.post('/admin/products', payload);

      toast.success(isEdit ? 'Product updated' : 'Product created');
      navigate('/admin/products');
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loading) return <PageLoader label="Loading product" />;

  const discount = percentOff(Number(form.mrp), Number(form.price));

  return (
    <form onSubmit={submit} className="space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/admin/products" className="text-sm text-ink-500 hover:text-brand-700">
            ← Back to products
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{isEdit ? 'Edit product' : 'New product'}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEdit && (
            <button type="button" className="btn-outline" onClick={duplicate} disabled={duplicating || saving}>
              {duplicating ? <Spinner className="h-4 w-4" /> : <CopyIcon width={16} height={16} />} Duplicate
            </button>
          )}
          <Link to="/admin/products" className="btn-outline">
            Cancel
          </Link>
          <button className="btn-primary" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} {isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Basics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Product name" required error={errors.name} className="sm:col-span-2">
                <input className={cx('input', errors.name && 'input-error')} value={form.name} onChange={set('name')} />
              </Field>
              <Field label="SKU" required error={errors.sku} hint="Internal stock code, must be unique">
                <input className={cx('input', errors.sku && 'input-error')} value={form.sku} onChange={set('sku')} />
              </Field>
              <Field label="URL slug" error={errors.slug} hint="Leave blank to generate from the name">
                <input className={cx('input', errors.slug && 'input-error')} value={form.slug} onChange={set('slug')} />
              </Field>
              <Field label="Category" className="sm:col-span-2">
                <select className="input" value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">No category</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Short description" className="sm:col-span-2" hint="One line shown on product cards">
                <input className="input" maxLength={300} value={form.shortDesc} onChange={set('shortDesc')} />
              </Field>
              <Field label="Full description" className="sm:col-span-2">
                <textarea className="input min-h-40" value={form.description} onChange={set('description')} />
              </Field>
              <Field label="Tags" className="sm:col-span-2" hint="Comma separated — used by search and filters">
                <input className="input" placeholder="vitamin d, immunity, softgel" value={form.tags} onChange={set('tags')} />
              </Field>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold">Images</h2>
            <p className="mt-1 text-sm text-ink-500">
              Up to 8 images. Drag images to sort them — the first is the main thumbnail and carousel images follow this order.
              New images appear in the home page carousel by default; untick <strong>Show carousel</strong> to remove one, or tick it again to add it back.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {form.images.map((img, i) => (
                <div
                  key={`${img.url}-${i}`}
                  draggable
                  onDragStart={(e) => {
                    // Firefox requires a payload before it will permit a drop.
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                    setDraggedImage(i);
                  }}
                  onDragEnd={() => setDraggedImage(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = draggedImage ?? Number(e.dataTransfer.getData('text/plain'));
                    moveImage(from, i);
                    setDraggedImage(null);
                  }}
                  className={cx('cursor-grab transition-opacity active:cursor-grabbing', draggedImage === i && 'opacity-50')}
                >
                  <div className="group relative aspect-square overflow-hidden rounded-lg border border-ink-100 bg-ink-50">
                    <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 badge bg-brand-700 text-[10px] text-white">Main</span>}
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">Drag to sort</span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          images: f.images.filter((_, idx) => idx !== i),
                          // An option must never point at an image that is gone.
                          variants: f.variants.map((v) => (v.image === img.url ? { ...v, image: '' } : v)),
                        }))
                      }
                      className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-kupaa-black opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </div>

                  <label className="mt-1.5 flex cursor-pointer items-start gap-1.5 text-[11px] leading-snug text-ink-600">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      checked={Boolean(img.showInCarousel)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          images: f.images.map((image, idx) =>
                            idx === i ? { ...image, showInCarousel: e.target.checked } : image,
                          ),
                        }))
                      }
                    />
                    Show carousel
                  </label>
                  <div className="mt-1 flex gap-1" aria-label={`Reorder image ${i + 1}`}>
                    <button
                      type="button"
                      onClick={() => moveImage(i, i - 1)}
                      disabled={i === 0}
                      className="rounded px-1.5 py-0.5 text-[11px] text-ink-600 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move image ${i + 1} earlier`}
                    >
                      ← Move
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(i, i + 1)}
                      disabled={i === form.images.length - 1}
                      className="rounded px-1.5 py-0.5 text-[11px] text-ink-600 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move image ${i + 1} later`}
                    >
                      Move →
                    </button>
                  </div>
                </div>
              ))}

              {form.images.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink-200 text-ink-400 transition hover:border-brand-400 hover:text-brand-600"
                >
                  {uploading ? <Spinner className="h-5 w-5" /> : <ImageIcon width={22} height={22} />}
                  <span className="text-xs font-medium">{uploading ? 'Uploading' : 'Add image'}</span>
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />

            <Field label="Or paste an image URL" className="mt-4">
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="https://…"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const url = e.currentTarget.value.trim();
                    if (!url) return;
                    setForm((f) => ({ ...f, images: [...f.images, { url, alt: '', showInCarousel: true }].slice(0, 8) }));
                    e.currentTarget.value = '';
                  }}
                />
              </div>
              <p className="hint">Press Enter to add.</p>
            </Field>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Options the customer chooses</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Sizes, weights or pack counts — 500 g and 1 kg, say. Each carries its own price, stock, SKU and packed shipping
                  dimensions. Leave this empty for a product that comes one way only.
                </p>
              </div>
              <button type="button" className="btn-outline btn-sm shrink-0" onClick={addVariant}>
                <PlusIcon width={14} height={14} /> Add option
              </button>
            </div>

            {hasVariants && (
              <div className="mt-4 max-w-xs">
                <Field label="What is being chosen?" required error={errors.variantLabel} hint="Shown above the buttons, e.g. Size">
                  <input
                    className={cx('input', errors.variantLabel && 'input-error')}
                    placeholder="Size"
                    maxLength={30}
                    value={form.variantLabel}
                    onChange={set('variantLabel')}
                  />
                </Field>
              </div>
            )}

            {hasVariants ? (
              <>
                <div className="mt-4 space-y-3">
                  {form.variants.map((variant, index) => (
                    <div
                      key={variant.id ?? index}
                      className={cx(
                        'rounded-xl border p-3.5',
                        variant.isActive ? 'border-ink-100 bg-ink-50/40' : 'border-ink-100 bg-ink-100/60 opacity-70',
                      )}
                    >
                      <div className="grid gap-3 sm:grid-cols-12">
                        <label className="sm:col-span-3">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">Option name</span>
                          <input
                            className="input py-2 text-sm"
                            placeholder="500 g"
                            maxLength={60}
                            value={variant.name}
                            onChange={(e) => setVariant(index, 'name', e.target.value)}
                          />
                        </label>
                        <label className="sm:col-span-3">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">SKU</span>
                          <input
                            className="input py-2 text-sm"
                            placeholder="KUP-WPI-500"
                            maxLength={60}
                            value={variant.sku}
                            onChange={(e) => setVariant(index, 'sku', e.target.value)}
                          />
                        </label>
                        <label className="sm:col-span-2">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">Price ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-2 text-sm"
                            value={variant.price}
                            onChange={(e) => setVariant(index, 'price', e.target.value)}
                          />
                        </label>
                        <label className="sm:col-span-2">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">MRP ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-2 text-sm"
                            value={variant.mrp}
                            onChange={(e) => setVariant(index, 'mrp', e.target.value)}
                          />
                        </label>
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">Stock</span>
                          <input
                            type="number"
                            min="0"
                            className="input py-2 text-sm"
                            value={variant.stock}
                            onChange={(e) => setVariant(index, 'stock', e.target.value)}
                          />
                        </label>
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">kg</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="input py-2 text-sm"
                            value={variant.weightKg}
                            onChange={(e) => setVariant(index, 'weightKg', e.target.value)}
                          />
                        </label>
                      </div>

                      <label className="mt-3 block max-w-xs">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">L × B × H cm</span>
                        <div className="flex gap-1">
                          <input type="number" min="1" step="0.5" className="input py-2 text-sm" aria-label="Length in cm" value={variant.lengthCm} onChange={(e) => setVariant(index, 'lengthCm', e.target.value)} />
                          <input type="number" min="1" step="0.5" className="input py-2 text-sm" aria-label="Breadth in cm" value={variant.breadthCm} onChange={(e) => setVariant(index, 'breadthCm', e.target.value)} />
                          <input type="number" min="1" step="0.5" className="input py-2 text-sm" aria-label="Height in cm" value={variant.heightCm} onChange={(e) => setVariant(index, 'heightCm', e.target.value)} />
                        </div>
                      </label>

                      {form.images.length > 0 && (
                        <div className="mt-3">
                          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-ink-500">
                            Photo shown for this option
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setVariant(index, 'image', '')}
                              aria-pressed={!variant.image}
                              className={cx(
                                'h-12 rounded-lg border-2 px-2.5 text-xs font-medium transition',
                                variant.image ? 'border-ink-200 text-ink-500 hover:border-ink-300' : 'border-brand-600 text-brand-700',
                              )}
                            >
                              Main image
                            </button>
                            {form.images.map((img, imgIndex) => (
                              <button
                                key={`${img.url}-${imgIndex}`}
                                type="button"
                                onClick={() => setVariant(index, 'image', img.url)}
                                aria-label={`Use image ${imgIndex + 1} for this option`}
                                aria-pressed={variant.image === img.url}
                                className={cx(
                                  'h-12 w-12 overflow-hidden rounded-lg border-2 bg-white transition',
                                  variant.image === img.url ? 'border-brand-600' : 'border-ink-200 hover:border-ink-300',
                                )}
                              >
                                <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                          <p className="hint">The product page switches to this photo when the option is chosen.</p>
                        </div>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-ink-600">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                            checked={variant.isActive}
                            onChange={(e) => setVariant(index, 'isActive', e.target.checked)}
                          />
                          Available to buy
                        </label>

                        <div className="flex items-center gap-3">
                          {Number(variant.mrp) > Number(variant.price) && (
                            <span className="text-xs font-medium text-brand-600">
                              {percentOff(Number(variant.mrp), Number(variant.price))}% off
                            </span>
                          )}
                          <button
                            type="button"
                            className="rounded p-1.5 text-ink-400 hover:bg-ink-200 hover:text-kupaa-black"
                            onClick={() => removeVariant(index)}
                            aria-label={`Remove option ${variant.name || index + 1}`}
                          >
                            <TrashIcon width={15} height={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {errors.variants && <p className="error-text">{errors.variants}</p>}

                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
                  Customers pick one of these on the product page. The card shows a range from{' '}
                  {money(Math.min(...form.variants.map((v) => Number(v.price) || 0)))}, and total stock across options is{' '}
                  {form.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)} units. Removing an option that already appears
                  in an order hides it rather than deleting it, so past invoices still resolve.
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-ink-200 px-3.5 py-3 text-sm text-ink-500">
                No options — this product is sold one way, using the price, stock and weight set on this page.
              </p>
            )}
          </section>

          {!hasVariants && (
            <section className="card p-5">
              <h2 className="text-base font-semibold">Shipping dimensions</h2>
              <p className="mt-1 text-sm text-ink-500">
                Amazon Shipping needs these to quote a rate and print a label. Use the packed parcel, not the bare product.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Weight (kg)" required error={errors.weightKg}>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={cx('input', errors.weightKg && 'input-error')}
                    value={form.weightKg}
                    onChange={set('weightKg')}
                  />
                </Field>
                <Field label="Length (cm)">
                  <input type="number" step="0.5" min="1" className="input" value={form.lengthCm} onChange={set('lengthCm')} />
                </Field>
                <Field label="Breadth (cm)">
                  <input type="number" step="0.5" min="1" className="input" value={form.breadthCm} onChange={set('breadthCm')} />
                </Field>
                <Field label="Height (cm)">
                  <input type="number" step="0.5" min="1" className="input" value={form.heightCm} onChange={set('heightCm')} />
                </Field>
              </div>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-base font-semibold">Invoice details</h2>
            <Field label="HSN code" hint="Used on the shipping invoice">
              <input className="input" value={form.hsn} onChange={set('hsn')} />
            </Field>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Pricing</h2>
            {hasVariants && (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                Each option carries its own price. These fields mirror the cheapest one and are set for you.
              </p>
            )}
            <fieldset disabled={hasVariants} className={cx('mt-4 space-y-4', hasVariants && 'opacity-60')}>
              <Field label="Selling price (₹)" required error={errors.price}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cx('input', errors.price && 'input-error')}
                  value={form.price}
                  onChange={set('price')}
                />
              </Field>
              <Field label="MRP (₹)" required error={errors.mrp} hint="Shown struck through on the product page">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cx('input', errors.mrp && 'input-error')}
                  value={form.mrp}
                  onChange={set('mrp')}
                />
              </Field>
              <Field label="Discount" hint="Set a percentage and the selling price is recalculated from the MRP">
                <div className="flex flex-wrap gap-2">
                  <div className="relative w-28">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      className="input pr-7"
                      value={discountDraft}
                      placeholder="0"
                      onChange={(e) => setDiscountDraft(e.target.value)}
                      onBlur={() => discountDraft !== '' && applyDiscount(discountDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyDiscount(discountDraft);
                        }
                      }}
                      aria-label="Discount percentage"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">%</span>
                  </div>
                  {[10, 20, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => {
                        setDiscountDraft(String(pct));
                        applyDiscount(pct);
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                  {discount > 0 && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-kupaa-black hover:bg-ink-200"
                      onClick={() => {
                        setDiscountDraft('');
                        setForm((f) => ({ ...f, price: f.mrp }));
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </Field>

              {discount > 0 ? (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  Customers save {money(Number(form.mrp) - Number(form.price))} — a {discount}% discount.
                </p>
              ) : (
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-500">
                  No discount — the product shows at {money(Number(form.price) || 0)} with no struck-through price.
                </p>
              )}
            </fieldset>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold">Inventory</h2>
            {hasVariants && (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                Stock is held per option. The total is {form.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)} units.
              </p>
            )}
            <div className="mt-4 space-y-4">
              <Field label="Stock on hand">
                <input
                  type="number"
                  min="0"
                  className={cx('input', hasVariants && 'bg-ink-50')}
                  disabled={hasVariants}
                  value={hasVariants ? form.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0) : form.stock}
                  onChange={set('stock')}
                />
              </Field>
              <Field label="Low stock threshold" hint="Flagged on the dashboard below this level">
                <input type="number" min="0" className="input" value={form.lowStockAt} onChange={set('lowStockAt')} />
              </Field>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold">Visibility</h2>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={form.isActive}
                  onChange={set('isActive')}
                />
                Active — visible in the storefront
              </label>
              <label className="flex items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={form.isFeatured}
                  onChange={set('isFeatured')}
                />
                Featured — show in Bestsellers
              </label>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
