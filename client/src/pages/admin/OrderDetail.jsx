import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, download, mediaUrl } from '../../api/client';
import { ClockIcon, DownloadIcon, EditIcon, MailIcon, MapPinIcon, PackageIcon, RefreshIcon, TruckIcon } from '../../components/Icons';
import { Badge, ConfirmDialog, Field, Modal, PageLoader, Spinner, cx } from '../../components/ui';
import { ORDER_FLOW, dateTime, money, statusClass } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

const NEXT_STATUS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const { data: order, loading, reload } = useFetch(`/admin/orders/${id}`, [id]);
  useTitle(order ? `${order.orderNumber} · Admin` : 'Order · Admin');

  const [shipOpen, setShipOpen] = useState(false);
  const [rates, setRates] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [busy, setBusy] = useState(false);

  const [tracking, setTracking] = useState(null);
  const [trackingEdit, setTrackingEdit] = useState(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [confirmStatus, setConfirmStatus] = useState(null);

  if (loading || !order) return <PageLoader label="Loading order" />;

  const openShipDialog = async () => {
    setShipOpen(true);
    setRates(null);
    try {
      const { data } = await api.get(`/admin/orders/${id}/rates`);
      setRates(data);
      setSelectedService(data.recommended ?? data.services?.[0]?.serviceId ?? null);
    } catch (err) {
      toast.error(err.message);
      setRates({ serviceable: false, services: [] });
    }
  };

  const ship = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/ship`, { serviceId: selectedService || undefined });
      toast.success('Label bought — tracking number assigned');
      setShipOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/orders/${id}/status`, { status: confirmStatus });
      toast.success(`Order marked ${confirmStatus.toLowerCase()}`);
      setConfirmStatus(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    try {
      const { data } = await api.get(`/admin/orders/${id}/track`);
      setTracking(data);
      toast.success(`Amazon Shipping says: ${data.status}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const getDocuments = async () => {
    setBusy(true);
    try {
      await api.get(`/admin/orders/${id}/documents`);
      toast.success('Shipping label ready');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadLabel = async () => {
    setBusy(true);
    try {
      await download(`/admin/orders/${id}/label`, `LABEL-${order.orderNumber}.pdf`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Opens the manual editor seeded with whatever the carrier already gave us. */
  const openTrackingEdit = () =>
    setTrackingEdit({
      awbCode: order.shipment?.awbCode ?? '',
      courierName: order.shipment?.courierName ?? '',
      trackingUrl: order.shipment?.trackingUrl ?? '',
      etd: order.shipment?.etd ?? '',
      status: order.shipment?.status ?? '',
      note: '',
    });

  const saveTracking = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/orders/${id}/shipment`, trackingEdit);
      toast.success('Tracking updated');
      setTrackingEdit(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const getInvoice = async () => {
    try {
      await download(`/admin/orders/${id}/invoice`, `INV-${order.orderNumber}.pdf`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const whatsappInvoice = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/orders/${id}/invoice/whatsapp`);
      toast.success(`Invoice sent to +${data.to}${data.mock ? ' (mock mode)' : ''}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/refund`, {
        amount: refundAmount ? Number(refundAmount) : undefined,
        reason: refundReason || undefined,
      });
      toast.success('Refund issued');
      setRefundOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const canShip = !['CANCELLED', 'RETURNED', 'DELIVERED'].includes(order.status) && (order.paymentMethod === 'COD' || order.paymentStatus === 'PAID');
  const currentStep = Math.max(0, ORDER_FLOW.indexOf(order.status));

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/orders" className="text-sm text-ink-500 hover:text-brand-700">
            ← Back to orders
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-500">Placed {dateTime(order.placedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusClass(order.status)}>{order.status}</Badge>
          <Badge className={statusClass(order.paymentStatus)}>
            {order.paymentMethod === 'COD' ? 'COD' : 'Online'} · {order.paymentStatus}
          </Badge>
        </div>
      </header>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ol className="flex min-w-72 flex-1 items-center">
            {ORDER_FLOW.map((step, i) => (
              <li key={step} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <span
                    className={cx(
                      'grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold',
                      i <= currentStep && !['CANCELLED', 'RETURNED'].includes(order.status)
                        ? 'bg-brand-700 text-white'
                        : 'bg-ink-100 text-ink-400',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="mt-1 whitespace-nowrap text-[10px] font-medium text-ink-500">
                    {step.charAt(0) + step.slice(1).toLowerCase()}
                  </span>
                </div>
                {i < ORDER_FLOW.length - 1 && (
                  <span className={cx('mb-4 h-0.5 flex-1', i < currentStep ? 'bg-brand-700' : 'bg-ink-100')} />
                )}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2">
            {canShip && !order.shipment?.awbCode && (
              <button className="btn-primary" onClick={openShipDialog}>
                <TruckIcon width={16} height={16} /> Ship with Amazon
              </button>
            )}
            {NEXT_STATUS[order.status]?.map((status) => (
              <button
                key={status}
                onClick={() => setConfirmStatus(status)}
                className={status === 'CANCELLED' ? 'btn-outline text-kupaa-black' : 'btn-outline'}
              >
                Mark {status.toLowerCase()}
              </button>
            ))}
            <button className="btn-outline" onClick={openTrackingEdit}>
              <EditIcon width={15} height={15} /> {order.shipment?.awbCode ? 'Edit tracking' : 'Add tracking'}
            </button>
            <button className="btn-outline" onClick={getInvoice}>
              <DownloadIcon width={15} height={15} /> Invoice
            </button>
            <button className="btn-outline" onClick={whatsappInvoice} disabled={busy}>
              <MailIcon width={15} height={15} /> {order.invoiceSentAt ? 'Resend invoice' : 'WhatsApp invoice'}
            </button>
            {order.paymentStatus === 'PAID' && (
              <button className="btn-outline text-ink-700" onClick={() => setRefundOpen(true)}>
                Refund
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Items</h2>
            <div className="table-wrap mt-3 border-0">
              <table className="table min-w-full">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                            {item.image ? (
                              <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-ink-400">
                                <PackageIcon width={16} height={16} />
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="line-clamp-1 font-medium text-ink-900">
                              {item.name}
                              {item.variantName && <span className="ml-1.5 font-normal text-brand-700">· {item.variantName}</span>}
                            </p>
                            <p className="text-xs text-ink-500">
                              {item.sku} · {item.weightKg} kg
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-right">{money(item.price)}</td>
                      <td className="text-right font-semibold">{money(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-brand-700">
                  <dt>Discount {order.couponCode && `(${order.couponCode})`}</dt>
                  <dd>−{money(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Shipping</dt>
                <dd>{order.shippingFee === 0 ? 'Free' : money(order.shippingFee)}</dd>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Tax</dt>
                  <dd>{money(order.tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold text-ink-950">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
          </section>

          {order.shipment && (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TruckIcon width={18} height={18} /> Shipment
                </h2>
                <div className="flex gap-2">
                  {order.shipment.awbCode && (
                    <button className="btn-outline btn-sm" onClick={refresh}>
                      <RefreshIcon width={14} height={14} /> Refresh tracking
                    </button>
                  )}
                  {order.shipment.carrierShipmentId && !order.shipment.labelUrl && (
                    <button className="btn-outline btn-sm" onClick={getDocuments} disabled={busy}>
                      <DownloadIcon width={14} height={14} /> Get label
                    </button>
                  )}
                  <button className="btn-outline btn-sm" onClick={openTrackingEdit}>
                    <EditIcon width={14} height={14} /> Edit tracking
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
                {[
                  ['Amazon shipment', order.shipment.carrierShipmentId],
                  ['Tracking ID', order.shipment.awbCode],
                  ['Service', order.shipment.courierName],
                  ['Status', order.shipment.status],
                  ['Freight charge', order.shipment.freightCharge != null ? money(order.shipment.freightCharge) : null],
                  ['Expected delivery', order.shipment.etd],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-ink-50 pb-1.5">
                      <dt className="text-ink-500">{label}</dt>
                      <dd className="text-right font-medium text-ink-900">{value}</dd>
                    </div>
                  ))}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {order.shipment.carrierShipmentId && (
                  <button className="btn-secondary btn-sm" onClick={downloadLabel} disabled={busy}>
                    <DownloadIcon width={14} height={14} /> Download label
                  </button>
                )}
                {order.shipment.trackingUrl && (
                  <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
                    Public tracking page
                  </a>
                )}
              </div>

              {tracking?.activities?.length > 0 && (
                <ol className="mt-5 border-t border-ink-100 pt-4">
                  {tracking.activities.map((a, i) => (
                    <li key={`${a.date}-${i}`} className="flex gap-3 pb-4 last:pb-0">
                      <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', i === 0 ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-500')}>
                        <ClockIcon width={13} height={13} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink-900">{a.activity || a.status}</p>
                        <p className="text-xs text-ink-500">
                          {a.location ? `${a.location} · ` : ''}
                          {a.date}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-base font-semibold">Activity log</h2>
            <ul className="mt-3 space-y-3">
              {order.events?.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div>
                    <p className="text-ink-800">{event.message || event.status}</p>
                    <p className="text-xs text-ink-400">
                      {dateTime(event.createdAt)} · {event.source.toLowerCase()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Customer</h2>
            <p className="mt-3 font-medium text-ink-900">{order.user?.name ?? order.shipName}</p>
            <p className="text-sm text-ink-500">{order.shipEmail}</p>
            <p className="text-sm text-ink-500">{order.shipPhone}</p>
            {order.user && (
              <Link to={`/admin/customers?q=${encodeURIComponent(order.user.email)}`} className="btn-outline btn-sm mt-3">
                View customer
              </Link>
            )}
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <MapPinIcon width={17} height={17} /> Delivery address
            </h2>
            <address className="mt-3 text-sm not-italic leading-relaxed text-ink-600">
              <span className="font-semibold text-ink-900">{order.shipName}</span>
              <br />
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ''}
              <br />
              {order.shipCity}, {order.shipState} {order.shipPincode}
              <br />
              {order.shipCountry}
            </address>
            {order.notes && (
              <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-900">
                <span className="font-semibold">Customer note:</span> {order.notes}
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold">Payment</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Method</dt>
                <dd className="font-medium">{order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Razorpay'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Status</dt>
                <dd className="font-medium">{order.paymentStatus}</dd>
              </div>
              {order.razorpayOrderId && (
                <div>
                  <dt className="text-ink-500">Razorpay order</dt>
                  <dd className="break-all text-xs font-medium">{order.razorpayOrderId}</dd>
                </div>
              )}
              {order.razorpayPaymentId && (
                <div>
                  <dt className="text-ink-500">Payment ID</dt>
                  <dd className="break-all text-xs font-medium">{order.razorpayPaymentId}</dd>
                </div>
              )}
              {order.invoiceSentAt && (
                <div>
                  <dt className="text-ink-500">Invoice on WhatsApp</dt>
                  <dd className="text-xs font-medium">{dateTime(order.invoiceSentAt)}</dd>
                </div>
              )}
              {order.refundId && (
                <div>
                  <dt className="text-ink-500">Refund ID</dt>
                  <dd className="break-all text-xs font-medium">{order.refundId}</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
      </div>

      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Ship this order"
        footer={
          <>
            <button className="btn-outline" onClick={() => setShipOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={ship} disabled={busy || !rates?.serviceable}>
              {busy && <Spinner className="h-4 w-4" />} Buy label
            </button>
          </>
        }
      >
        {!rates ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : !rates.serviceable ? (
          <p className="text-sm text-ink-700">
            Amazon Shipping does not serve {order.shipPincode} for this parcel. Contact the customer.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-600">
              Parcel weight {rates.weightKg} kg to {order.shipPincode}. Pick a service — cheapest is preselected. Amazon
              collects from your registered pickup address on its usual round, so there is no pickup to book.
            </p>

            <ul className="mt-4 space-y-2">
              {rates.services.map((service) => (
                <li key={service.serviceId}>
                  <label
                    className={cx(
                      'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition',
                      selectedService === service.serviceId ? 'border-brand-600 bg-brand-50/40' : 'border-ink-100 hover:border-ink-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="shipping-service"
                      className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                      checked={selectedService === service.serviceId}
                      onChange={() => setSelectedService(service.serviceId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">{service.name}</p>
                      <p className="text-xs text-ink-500">
                        {service.etd ? `Delivers by ${service.etd}` : `${service.estimatedDays} days`}
                        {service.cod ? ' · collects COD' : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink-950">{money(service.rate)}</span>
                  </label>
                </li>
              ))}
            </ul>

            {rates.mock && (
              <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-800">
                Amazon Shipping credentials are not set, so this creates a simulated shipment. Add them under Integrations
                to go live.
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(trackingEdit)}
        onClose={() => setTrackingEdit(null)}
        title="Tracking details"
        footer={
          <>
            <button className="btn-outline" onClick={() => setTrackingEdit(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={saveTracking} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Save tracking
            </button>
          </>
        }
      >
        {trackingEdit && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Type these in when the carrier is not filling them for you — a parcel handed over at a counter, a courier
              booked outside Amazon, or a number Amazon reissued. Leave a field empty to clear it.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['awbCode', 'Tracking number', 'e.g. 1Z999AA10123456784'],
                ['courierName', 'Courier or service', 'e.g. Amazon Shipping · Standard'],
                ['status', 'Carrier status', 'e.g. In transit'],
                ['etd', 'Expected delivery', 'e.g. 2026-09-08'],
              ].map(([key, label, placeholder]) => (
                <Field key={key} label={label}>
                  <input
                    className="input"
                    placeholder={placeholder}
                    value={trackingEdit[key]}
                    onChange={(e) => setTrackingEdit((t) => ({ ...t, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>

            <Field label="Tracking page link" hint="Left blank, an Amazon Shipping number gets its tracking link filled in">
              <input
                className="input"
                placeholder="https://…"
                value={trackingEdit.trackingUrl}
                onChange={(e) => setTrackingEdit((t) => ({ ...t, trackingUrl: e.target.value }))}
              />
            </Field>

            <Field label="Note (internal)" hint="Added to the activity log with the change">
              <input
                className="input"
                placeholder="Why this was edited"
                value={trackingEdit.note}
                onChange={(e) => setTrackingEdit((t) => ({ ...t, note: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Issue a refund"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setRefundOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-danger" onClick={refund} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Refund
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          This refunds through Razorpay to the customer’s original payment method. Money reaches them in 5–7 working days.
        </p>
        <div className="mt-4 space-y-4">
          <Field label="Amount (₹)" hint={`Leave blank to refund the full ${money(order.total)}`}>
            <input
              type="number"
              min="1"
              max={order.total}
              className="input"
              placeholder={String(order.total)}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </Field>
          <Field label="Reason (internal)">
            <input className="input" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmStatus)}
        onClose={() => setConfirmStatus(null)}
        onConfirm={changeStatus}
        busy={busy}
        danger={confirmStatus === 'CANCELLED'}
        title={`Mark this order ${confirmStatus?.toLowerCase()}?`}
        message={
          confirmStatus === 'CANCELLED'
            ? 'Cancelling restores the reserved stock. If the order was paid online you still need to issue the refund separately.'
            : `The customer sees this change immediately in their order history.`
        }
        confirmLabel={`Mark ${confirmStatus?.toLowerCase()}`}
      />
    </div>
  );
}
