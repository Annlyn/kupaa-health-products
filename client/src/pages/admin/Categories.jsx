import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, mediaUrl } from '../../api/client';
import { PlusIcon, TagIcon } from '../../components/Icons';
import { Badge, ConfirmDialog, EmptyState, Field, Modal, Spinner, cx } from '../../components/ui';
import { useFetch, useTitle } from '../../lib/hooks';

const BLANK = { name: '', slug: '', description: '', image: '', isActive: true, sortOrder: 0 };

export default function AdminCategories() {
  useTitle('Categories · Admin');
  const { data: categories, loading, reload } = useFetch('/admin/categories');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (category) => {
    setForm(category ? { ...BLANK, ...category, description: category.description || '', image: category.image || '' } : BLANK);
    setErrors({});
    setEditing(category || {});
  };

  const save = async (e) => {
    e?.preventDefault();
    if (form.name.trim().length < 2) return setErrors({ name: 'Enter a category name' });

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        image: form.image.trim(),
        isActive: Boolean(form.isActive),
        sortOrder: Number(form.sortOrder) || 0,
      };

      if (editing?.id) await api.put(`/admin/categories/${editing.id}`, payload);
      else await api.post('/admin/categories', payload);

      toast.success(editing?.id ? 'Category updated' : 'Category created');
      setEditing(null);
      reload();
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/admin/categories/${deleting.id}`);
      toast.success('Category deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="mt-1 text-sm text-ink-500">Group products so shoppers can browse by goal.</p>
        </div>
        <button className="btn-primary" onClick={() => open(null)}>
          <PlusIcon width={16} height={16} /> Add category
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : categories?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <article key={category.id} className="card overflow-hidden">
              <div className="aspect-[16/9] bg-ink-100">
                {category.image ? (
                  <img src={mediaUrl(category.image)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-ink-300">
                    <TagIcon width={26} height={26} />
                  </span>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-ink-900">{category.name}</h2>
                    <p className="truncate text-xs text-ink-500">/{category.slug}</p>
                  </div>
                  <Badge className={category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600'}>
                    {category.isActive ? 'Active' : 'Hidden'}
                  </Badge>
                </div>

                {category.description && <p className="mt-2 line-clamp-2 text-xs text-ink-500">{category.description}</p>}

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">
                    {category.productCount} product{category.productCount === 1 ? '' : 's'} · order {category.sortOrder}
                  </span>
                  <div className="flex gap-1">
                    <button className="btn-outline btn-sm" onClick={() => open(category)}>
                      Edit
                    </button>
                    <button
                      className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeleting(category)}
                      disabled={category.productCount > 0}
                      title={category.productCount > 0 ? 'Move its products first' : undefined}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={TagIcon}
          title="No categories yet"
          description="Categories power the shop filters and the home page grid."
          action={
            <button className="btn-primary" onClick={() => open(null)}>
              Create your first category
            </button>
          }
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'New category'}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <input className={cx('input', errors.name && 'input-error')} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Slug" hint="Leave blank to generate" className="sm:col-span-2">
            <input className="input" value={form.slug} onChange={set('slug')} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className="input min-h-24" maxLength={600} value={form.description} onChange={set('description')} />
          </Field>
          <Field label="Image URL" className="sm:col-span-2">
            <input className="input" placeholder="/uploads/… or https://…" value={form.image} onChange={set('image')} />
          </Field>
          <Field label="Sort order" hint="Lower numbers appear first">
            <input type="number" min="0" className="input" value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
          <label className="flex items-end gap-2.5 pb-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={form.isActive}
              onChange={set('isActive')}
            />
            Visible in the storefront
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete this category?"
        message={`${deleting?.name} will be removed. This only works when no products are assigned to it.`}
        confirmLabel="Delete category"
      />
    </div>
  );
}
