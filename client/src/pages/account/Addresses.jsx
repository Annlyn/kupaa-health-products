import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import AccountNav from './AccountNav';
import { MapPinIcon, PlusIcon } from '../../components/Icons';
import { Breadcrumbs, ConfirmDialog, EmptyState, Field, Modal, Spinner, cx } from '../../components/ui';
import { useFetch, useTitle } from '../../lib/hooks';

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const BLANK = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  isDefault: false,
};

export default function Addresses() {
  useTitle('Saved addresses');
  const { data: addresses, loading, reload } = useFetch('/addresses');

  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const open = (address) => {
    setForm(address ? { ...BLANK, ...address, line2: address.line2 || '' } : BLANK);
    setErrors({});
    setEditing(address || {});
  };

  const validate = () => {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter the recipient name';
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) next.phone = 'Enter a valid 10-digit mobile number';
    if (form.line1.trim().length < 4) next.line1 = 'Enter the house number and street';
    if (form.city.trim().length < 2) next.city = 'Enter the city';
    if (!form.state) next.state = 'Select the state';
    if (!/^\d{6}$/.test(form.pincode.trim())) next.pincode = 'Enter a valid 6-digit PIN code';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        label: form.label,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim(),
        city: form.city.trim(),
        state: form.state,
        pincode: form.pincode.trim(),
        country: form.country || 'India',
        isDefault: Boolean(form.isDefault),
      };

      if (editing?.id) await api.put(`/addresses/${editing.id}`, payload);
      else await api.post('/addresses', payload);

      toast.success(editing?.id ? 'Address updated' : 'Address added');
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
    setBusyDelete(true);
    try {
      await api.del(`/addresses/${deleting.id}`);
      toast.success('Address removed');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyDelete(false);
    }
  };

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My account', to: '/account' }, { label: 'Addresses' }]} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Saved addresses</h1>
        <button className="btn-primary" onClick={() => open(null)}>
          <PlusIcon width={16} height={16} /> Add address
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <AccountNav />

        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-7 w-7 text-brand-600" />
            </div>
          ) : addresses?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {addresses.map((address) => (
                <article key={address.id} className={cx('card p-5', address.isDefault && 'ring-2 ring-brand-500')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="badge bg-ink-100 text-ink-600">{address.label}</span>
                    {address.isDefault && <span className="badge bg-brand-50 text-brand-700">Default</span>}
                  </div>

                  <p className="mt-3 font-semibold text-ink-900">{address.fullName}</p>
                  <address className="mt-1 text-sm not-italic leading-relaxed text-ink-600">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                    <br />
                    {address.city}, {address.state} {address.pincode}
                    <br />
                    {address.phone}
                  </address>

                  <div className="mt-4 flex gap-2">
                    <button className="btn-outline btn-sm" onClick={() => open(address)}>
                      Edit
                    </button>
                    <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(address)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MapPinIcon}
              title="No saved addresses"
              description="Add one now and checkout gets a lot faster."
              action={
                <button className="btn-primary" onClick={() => open(null)}>
                  Add your first address
                </button>
              }
            />
          )}
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit address' : 'Add a new address'}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Save address
            </button>
          </>
        }
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.fullName}>
            <input className={cx('input', errors.fullName && 'input-error')} value={form.fullName} onChange={set('fullName')} />
          </Field>
          <Field label="Mobile number" required error={errors.phone}>
            <input
              className={cx('input', errors.phone && 'input-error')}
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) => {
                setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }));
                setErrors((p) => ({ ...p, phone: undefined }));
              }}
            />
          </Field>
          <Field label="Flat, house no., building" required error={errors.line1} className="sm:col-span-2">
            <input className={cx('input', errors.line1 && 'input-error')} value={form.line1} onChange={set('line1')} />
          </Field>
          <Field label="Area, street, landmark" className="sm:col-span-2">
            <input className="input" value={form.line2} onChange={set('line2')} />
          </Field>
          <Field label="City" required error={errors.city}>
            <input className={cx('input', errors.city && 'input-error')} value={form.city} onChange={set('city')} />
          </Field>
          <Field label="State" required error={errors.state}>
            <select className={cx('input', errors.state && 'input-error')} value={form.state} onChange={set('state')}>
              <option value="">Select state</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PIN code" required error={errors.pincode}>
            <input
              className={cx('input', errors.pincode && 'input-error')}
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => {
                setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }));
                setErrors((p) => ({ ...p, pincode: undefined }));
              }}
            />
          </Field>
          <Field label="Address type">
            <select className="input" value={form.label} onChange={set('label')}>
              <option>Home</option>
              <option>Work</option>
              <option>Other</option>
            </select>
          </Field>
          <label className="flex items-center gap-2.5 text-sm text-ink-600 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={Boolean(form.isDefault)}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
            />
            Make this my default delivery address
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busyDelete}
        title="Delete this address?"
        message={`${deleting?.fullName}, ${deleting?.city} — this cannot be undone. Past orders keep their own copy of the address.`}
        confirmLabel="Delete address"
      />
    </div>
  );
}
