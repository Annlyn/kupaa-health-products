import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { PlusIcon, TagIcon } from '../../components/Icons';
import { Badge, ConfirmDialog, EmptyState, Field, Modal, Spinner, cx } from '../../components/ui';
import { dateShort, money } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

const BLANK = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: 10,
  minOrder: 0,
  maxDiscount: '',
  usageLimit: '',
  startsAt: '',
  expiresAt: '',
  isActive: true,
};

const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export default function AdminCoupons() {
  useTitle('Coupons · Admin');
  const { data: coupons, loading, reload } = useFetch('/admin/coupons');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (coupon) => {
    setForm(
      coupon
        ? {
            ...BLANK,
            ...coupon,
            description: coupon.description || '',
            maxDiscount: coupon.maxDiscount ?? '',
            usageLimit: coupon.usageLimit ?? '',
            startsAt: asDateInput(coupon.startsAt),
            expiresAt: asDateInput(coupon.expiresAt),
          }
        : BLANK,
    );
    setErrors({});
    setEditing(coupon || {});
  };

  const save = async (e) => {
    e?.preventDefault();

    const next = {};
    if (form.code.trim().length < 3) next.code = 'Code must be at least 3 characters';
    if (!(Number(form.value) > 0)) next.value = 'Enter a discount value';
    if (form.type === 'PERCENT' && Number(form.value) > 100) next.value = 'A percentage cannot exceed 100';
    if (Object.keys(next).length) return setErrors(next);

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        type: form.type,
        value: Number(form.value),
        minOrder: Number(form.minOrder) || 0,
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        isActive: Boolean(form.isActive),
      };

      if (editing?.id) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post('/admin/coupons', payload);

      toast.success(editing?.id ? 'Coupon updated' : 'Coupon created');
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
      await api.del(`/admin/coupons/${deleting.id}`);
      toast.success('Coupon deleted');
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

  const isExpired = (coupon) => coupon.expiresAt && new Date(coupon.expiresAt) < new Date();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Coupons</h1>
          <p className="mt-1 text-sm text-ink-500">Discount codes customers can apply at checkout.</p>
        </div>
        <button className="btn-primary" onClick={() => open(null)}>
          <PlusIcon width={16} height={16} /> New coupon
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : coupons?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Conditions</th>
                <th className="text-center">Used</th>
                <th>Validity</th>
                <th className="text-center">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td>
                    <p className="font-mono text-sm font-bold text-ink-900">{coupon.code}</p>
                    {coupon.description && <p className="text-xs text-ink-500">{coupon.description}</p>}
                  </td>
                  <td className="text-sm font-semibold">
                    {coupon.type === 'PERCENT' ? `${coupon.value}% off` : `${money(coupon.value)} off`}
                    {coupon.maxDiscount != null && <span className="block text-xs font-normal text-ink-500">max {money(coupon.maxDiscount)}</span>}
                  </td>
                  <td className="text-xs text-ink-600">
                    {coupon.minOrder > 0 ? `Min order ${money(coupon.minOrder)}` : 'No minimum'}
                  </td>
                  <td className="text-center text-sm">
                    {coupon.usedCount}
                    {coupon.usageLimit != null && <span className="text-ink-400"> / {coupon.usageLimit}</span>}
                  </td>
                  <td className="text-xs text-ink-600">
                    {coupon.startsAt ? `From ${dateShort(coupon.startsAt)}` : 'Active now'}
                    <br />
                    {coupon.expiresAt ? `Until ${dateShort(coupon.expiresAt)}` : 'No expiry'}
                  </td>
                  <td className="text-center">
                    <Badge
                      className={
                        !coupon.isActive
                          ? 'bg-ink-100 text-ink-600'
                          : isExpired(coupon)
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }
                    >
                      {!coupon.isActive ? 'Disabled' : isExpired(coupon) ? 'Expired' : 'Live'}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-outline btn-sm" onClick={() => open(coupon)}>
                        Edit
                      </button>
                      <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(coupon)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={TagIcon}
          title="No coupons yet"
          description="Create a welcome offer to convert first-time visitors."
          action={
            <button className="btn-primary" onClick={() => open(null)}>
              Create a coupon
            </button>
          }
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit coupon' : 'New coupon'}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Save coupon
            </button>
          </>
        }
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required error={errors.code} hint="Customers type this at checkout">
            <input
              className={cx('input font-mono uppercase', errors.code && 'input-error')}
              value={form.code}
              onChange={(e) => {
                setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }));
                setErrors((p) => ({ ...p, code: undefined }));
              }}
            />
          </Field>
          <Field label="Discount type">
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="PERCENT">Percentage off</option>
              <option value="FLAT">Flat amount off</option>
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input className="input" maxLength={200} value={form.description} onChange={set('description')} />
          </Field>
          <Field label={form.type === 'PERCENT' ? 'Percentage (%)' : 'Amount (₹)'} required error={errors.value}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={cx('input', errors.value && 'input-error')}
              value={form.value}
              onChange={set('value')}
            />
          </Field>
          <Field label="Minimum order value (₹)">
            <input type="number" min="0" className="input" value={form.minOrder} onChange={set('minOrder')} />
          </Field>
          {form.type === 'PERCENT' && (
            <Field label="Maximum discount (₹)" hint="Caps the discount — leave blank for none">
              <input type="number" min="0" className="input" value={form.maxDiscount} onChange={set('maxDiscount')} />
            </Field>
          )}
          <Field label="Usage limit" hint="Total redemptions allowed — blank for unlimited">
            <input type="number" min="1" className="input" value={form.usageLimit} onChange={set('usageLimit')} />
          </Field>
          <Field label="Starts on">
            <input type="date" className="input" value={form.startsAt} onChange={set('startsAt')} />
          </Field>
          <Field label="Expires on">
            <input type="date" className="input" value={form.expiresAt} onChange={set('expiresAt')} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm text-ink-700 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={form.isActive}
              onChange={set('isActive')}
            />
            Active — customers can use this code
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete this coupon?"
        message={`${deleting?.code} will stop working immediately. Orders that already used it are unaffected.`}
        confirmLabel="Delete coupon"
      />
    </div>
  );
}
