import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { ProductImage } from '../../components/ProductCard';
import { CheckCircle, MapPinIcon, ShieldIcon, TruckIcon } from '../../components/Icons';
import { Breadcrumbs, EmptyState, Field, PageLoader, Spinner, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { money } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

const BLANK_ADDRESS = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Loads the Razorpay Checkout script if the deferred tag has not run yet. */
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  useTitle('Checkout');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, totals, coupon, loading: cartLoading, refresh } = useCart();

  const { data: addresses } = useFetch('/addresses');
  const { data: paymentConfig } = useFetch('/payments/config');

  const [selectedId, setSelectedId] = useState(null);
  const [useNew, setUseNew] = useState(false);
  const [form, setForm] = useState({ ...BLANK_ADDRESS, fullName: '', phone: '' });
  const [saveAddress, setSaveAddress] = useState(true);
  const [errors, setErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('RAZORPAY');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [delivery, setDelivery] = useState(null);

  // Pre-select the default address; fall back to the "new address" form.
  useEffect(() => {
    if (!addresses) return;
    if (addresses.length) setSelectedId((prev) => prev ?? (addresses.find((a) => a.isDefault) ?? addresses[0]).id);
    else setUseNew(true);
  }, [addresses]);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, fullName: f.fullName || user.name, phone: f.phone || user.phone || '' }));
  }, [user]);

  useEffect(() => {
    if (paymentConfig && !paymentConfig.razorpay.enabled) setPaymentMethod('COD');
  }, [paymentConfig]);

  const chosenAddress = useNew ? form : addresses?.find((a) => a.id === selectedId);
  const pincode = chosenAddress?.pincode;

  // Variant weights differ (500 g vs 1 kg), so the courier quote uses the line weight.
  const totalWeight = useMemo(() => items.reduce((w, l) => w + (l.weightKg || 0.3) * l.quantity, 0), [items]);

  // Show the courier ETA as soon as we have a complete PIN code.
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode || '')) return setDelivery(null);
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(
          `/shipping/serviceability?pincode=${pincode}&weight=${totalWeight || 0.5}&cod=${paymentMethod === 'COD'}&value=${totals.total}`,
        );
        if (!cancelled) setDelivery(data);
      } catch {
        if (!cancelled) setDelivery(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pincode, totalWeight, paymentMethod, totals.total]);

  const validateNewAddress = () => {
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

  const placeOrder = async () => {
    if (useNew && !validateNewAddress()) return toast.error('Please fix the highlighted fields');
    if (!useNew && !selectedId) return toast.error('Choose a delivery address');
    if (delivery && !delivery.serviceable) return toast.error(`We cannot deliver to ${pincode} yet`);

    setPlacing(true);
    try {
      const payload = {
        paymentMethod,
        couponCode: coupon || undefined,
        notes: notes || undefined,
        ...(useNew ? { address: form, saveAddress } : { addressId: selectedId }),
      };

      const { data } = await api.post('/orders', payload);
      const { order, payment } = data;

      if (!payment) {
        await refresh();
        return navigate(`/order/${order.id}/success`, { replace: true });
      }

      const ready = await loadRazorpay();
      if (!ready) throw new Error('Could not load the payment window. Check your connection and retry from My Orders.');

      const rzp = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: payment.name,
        description: payment.description,
        order_id: payment.razorpayOrderId,
        prefill: payment.prefill,
        notes: { orderNumber: order.orderNumber },
        theme: { color: '#0a7668' },
        handler: async (response) => {
          try {
            await api.post('/payments/verify', {
              orderId: order.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await refresh();
            navigate(`/order/${order.id}/success`, { replace: true });
          } catch (err) {
            toast.error(err.message);
            navigate('/account/orders', { replace: true });
          }
        },
        modal: {
          ondismiss: async () => {
            await api.post('/payments/failed', { orderId: order.id, reason: 'Payment window closed' }).catch(() => {});
            toast('Payment cancelled. You can retry from My Orders.', { icon: '⚠️' });
            setPlacing(false);
          },
        },
      });

      rzp.on('payment.failed', async (resp) => {
        await api
          .post('/payments/failed', { orderId: order.id, reason: resp?.error?.description || 'Payment failed' })
          .catch(() => {});
        toast.error(resp?.error?.description || 'Payment failed');
        setPlacing(false);
      });

      rzp.open();
    } catch (err) {
      toast.error(err.message);
      setPlacing(false);
    }
  };

  if (cartLoading) return <PageLoader label="Preparing checkout" />;

  if (!items.length) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="There is nothing to check out"
          description="Add something to your cart first."
          action={
            <Link to="/shop" className="btn-primary">
              Browse products
            </Link>
          }
        />
      </div>
    );
  }

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Checkout</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MapPinIcon width={19} height={19} /> Delivery address
            </h2>

            {addresses?.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cx(
                      'cursor-pointer rounded-xl border-2 p-4 transition',
                      !useNew && selectedId === address.id ? 'border-brand-600 bg-brand-50/40' : 'border-ink-100 hover:border-ink-200',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="address"
                        className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                        checked={!useNew && selectedId === address.id}
                        onChange={() => {
                          setSelectedId(address.id);
                          setUseNew(false);
                        }}
                      />
                      <div className="min-w-0 text-sm">
                        <p className="flex items-center gap-2 font-semibold text-ink-900">
                          {address.fullName}
                          <span className="badge bg-ink-100 text-[10px] text-ink-600">{address.label}</span>
                        </p>
                        <p className="mt-1 leading-relaxed text-ink-600">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ''}
                          <br />
                          {address.city}, {address.state} {address.pincode}
                        </p>
                        <p className="mt-1 text-ink-500">{address.phone}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setUseNew((v) => !v)}
              className={cx('mt-4 text-sm font-semibold', useNew ? 'text-ink-500 hover:text-ink-800' : 'text-brand-700 hover:underline')}
            >
              {useNew && addresses?.length ? '← Use a saved address' : '+ Deliver to a new address'}
            </button>

            {useNew && (
              <div className="mt-4 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
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
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                  />
                  Save this address for future orders
                </label>
              </div>
            )}

            {delivery && (
              <div className={cx('mt-4 rounded-lg px-3.5 py-3 text-sm', delivery.serviceable ? 'bg-emerald-50' : 'bg-rose-50')}>
                {delivery.serviceable ? (
                  <p className="flex flex-wrap items-center gap-2 text-emerald-800">
                    <TruckIcon width={16} height={16} />
                    <span className="font-medium">Delivers to {delivery.pincode}</span>
                    {delivery.fastest && <span className="text-emerald-700">· {delivery.fastest.name}, {delivery.fastest.etd || `${delivery.fastest.estimatedDays} days`}</span>}
                  </p>
                ) : (
                  <p className="font-medium text-rose-700">We cannot deliver to {delivery.pincode} yet. Please try another PIN code.</p>
                )}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">Payment method</h2>

            <div className="mt-4 space-y-3">
              <label
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition',
                  paymentMethod === 'RAZORPAY' ? 'border-brand-600 bg-brand-50/40' : 'border-ink-100 hover:border-ink-200',
                  !paymentConfig?.razorpay.enabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                  checked={paymentMethod === 'RAZORPAY'}
                  disabled={!paymentConfig?.razorpay.enabled}
                  onChange={() => setPaymentMethod('RAZORPAY')}
                />
                <div className="text-sm">
                  <p className="font-semibold text-ink-900">Pay online</p>
                  <p className="mt-0.5 text-ink-500">UPI, credit & debit cards, netbanking and wallets via Razorpay.</p>
                  {!paymentConfig?.razorpay.enabled && (
                    <p className="mt-1 text-xs font-medium text-amber-600">Online payment is not configured on this store yet.</p>
                  )}
                </div>
              </label>

              <label
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition',
                  paymentMethod === 'COD' ? 'border-brand-600 bg-brand-50/40' : 'border-ink-100 hover:border-ink-200',
                  !paymentConfig?.cod.enabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                  checked={paymentMethod === 'COD'}
                  disabled={!paymentConfig?.cod.enabled}
                  onChange={() => setPaymentMethod('COD')}
                />
                <div className="text-sm">
                  <p className="font-semibold text-ink-900">Cash on delivery</p>
                  <p className="mt-0.5 text-ink-500">
                    Pay the courier when your parcel arrives
                    {paymentConfig?.cod.extraFee > 0 ? ` (+${money(paymentConfig.cod.extraFee)} handling fee)` : ''}.
                  </p>
                </div>
              </label>
            </div>

            <Field label="Order notes (optional)" className="mt-5">
              <textarea
                className="input min-h-20"
                placeholder="Delivery instructions, landmark, preferred time…"
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </section>
        </div>

        <aside className="lg:sticky lg:top-40 lg:h-fit">
          <div className="card p-5">
            <h2 className="text-lg font-semibold">Order summary</h2>

            <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto">
              {items.map((line) => (
                <li key={line.id} className="flex gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                    <ProductImage product={line.product} />
                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink-900 text-[10px] font-bold text-white">
                      {line.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium text-ink-800">{line.product.name}</p>
                    {line.variantName && <p className="text-xs font-medium text-brand-700">{line.variantName}</p>}
                    <p className="mt-0.5 text-xs text-ink-500">{money(line.unitPrice)} each</p>
                  </div>
                  <span className="text-sm font-semibold">{money(line.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2.5 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium">{money(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount ({totals.couponCode})</dt>
                  <dd className="font-medium">−{money(totals.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="font-medium">{totals.shippingFee === 0 ? 'Free' : money(totals.shippingFee)}</dd>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Tax</dt>
                  <dd className="font-medium">{money(totals.tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-100 pt-3 text-lg font-bold text-ink-950">
                <dt>Total payable</dt>
                <dd>{money(totals.total)}</dd>
              </div>
            </dl>

            <button className="btn-primary mt-5 w-full py-3" onClick={placeOrder} disabled={placing}>
              {placing ? <Spinner className="h-4 w-4" /> : <CheckCircle width={17} height={17} />}
              {paymentMethod === 'COD' ? 'Place order' : `Pay ${money(totals.total)}`}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-400">
              <ShieldIcon width={13} height={13} /> 256-bit encrypted checkout · PCI-DSS compliant
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
