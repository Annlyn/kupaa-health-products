import { Link, useParams } from 'react-router-dom';
import { CheckCircle, ClockIcon, MapPinIcon, PackageIcon, TruckIcon } from '../../components/Icons';
import { Badge, Breadcrumbs, EmptyState, PageLoader, cx } from '../../components/ui';
import { ORDER_FLOW, dateTime, money, statusClass } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

function ProgressTrail({ status }) {
  if (['CANCELLED', 'RETURNED'].includes(status)) {
    return (
      <div className={cx('rounded-lg px-4 py-3 text-sm font-medium', statusClass(status))}>
        This order was {status === 'CANCELLED' ? 'cancelled' : 'returned'}. Any payment made is refunded to the original method
        within 5–7 working days.
      </div>
    );
  }

  const current = Math.max(0, ORDER_FLOW.indexOf(status));

  return (
    <ol className="flex">
      {ORDER_FLOW.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="relative flex-1">
            <div className="flex items-center">
              <span
                className={cx(
                  'z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition',
                  done ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-400',
                )}
              >
                {done ? <CheckCircle width={16} height={16} /> : i + 1}
              </span>
              {i < ORDER_FLOW.length - 1 && <span className={cx('h-0.5 flex-1', i < current ? 'bg-brand-700' : 'bg-ink-100')} />}
            </div>
            <p className={cx('mt-2 text-[11px] font-medium sm:text-xs', done ? 'text-ink-900' : 'text-ink-400')}>
              {step.charAt(0) + step.slice(1).toLowerCase()}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { data: order, loading } = useFetch(`/orders/${id}`, [id]);
  const { data: tracking } = useFetch(order ? `/orders/${id}/track` : null, [order?.id]);

  useTitle(order ? `Order ${order.orderNumber}` : 'Order');

  if (loading) return <PageLoader label="Loading order" />;
  if (!order) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={PackageIcon}
          title="Order not found"
          action={
            <Link to="/account/orders" className="btn-primary">
              Back to my orders
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'My orders', to: '/account/orders' },
          { label: order.orderNumber },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-500">Placed on {dateTime(order.placedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusClass(order.status)}>{order.status}</Badge>
          <Badge className={statusClass(order.paymentStatus)}>
            {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'} · {order.paymentStatus}
          </Badge>
        </div>
      </header>

      <section className="card mt-6 p-5 sm:p-6">
        <ProgressTrail status={order.status} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Items</h2>
            <ul className="mt-3 divide-y divide-ink-50">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                    {item.image ? (
                      <img src={item.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-ink-300">
                        <PackageIcon width={20} height={20} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink-900">{item.name}</p>
                    {item.variantName && <p className="text-xs font-medium text-brand-700">{item.variantName}</p>}
                    <p className="mt-0.5 text-xs text-ink-500">
                      SKU {item.sku} · Qty {item.quantity} × {money(item.price)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{money(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
          </section>

          {tracking?.courier && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <TruckIcon width={18} height={18} /> Shipment tracking
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
                <p>
                  <span className="text-ink-500">AWB:</span> <span className="font-medium">{tracking.awb}</span>
                </p>
                {tracking.courierName && (
                  <p>
                    <span className="text-ink-500">Courier:</span> <span className="font-medium">{tracking.courierName}</span>
                  </p>
                )}
                {tracking.etd && (
                  <p>
                    <span className="text-ink-500">Expected:</span> <span className="font-medium">{tracking.etd}</span>
                  </p>
                )}
              </div>

              <ol className="mt-5">
                {tracking.courier.activities?.map((a, i) => (
                  <li key={`${a.date}-${i}`} className="flex gap-4 pb-5 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className={cx('grid h-6 w-6 place-items-center rounded-full', i === 0 ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-500')}>
                        <ClockIcon width={13} height={13} />
                      </span>
                      {i < tracking.courier.activities.length - 1 && <span className="mt-1 w-px flex-1 bg-ink-100" />}
                    </div>
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

              {tracking.trackingUrl && (
                <a href={tracking.trackingUrl} target="_blank" rel="noreferrer" className="btn-outline btn-sm mt-2">
                  Open courier page
                </a>
              )}
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-base font-semibold">Order history</h2>
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

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-semibold">Payment summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount {order.couponCode && `(${order.couponCode})`}</dt>
                  <dd>−{money(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd>{order.shippingFee === 0 ? 'Free' : money(order.shippingFee)}</dd>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Tax</dt>
                  <dd>{money(order.tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-100 pt-2.5 text-base font-bold text-ink-950">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
            {order.razorpayPaymentId && <p className="mt-3 break-all text-xs text-ink-400">Payment ID: {order.razorpayPaymentId}</p>}
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
              {order.shipPhone}
            </address>
            {order.notes && (
              <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                <span className="font-semibold">Note:</span> {order.notes}
              </p>
            )}
          </section>

          <Link to="/policies#returns" className="btn-outline w-full">
            Returns & refunds policy
          </Link>
        </aside>
      </div>
    </div>
  );
}
