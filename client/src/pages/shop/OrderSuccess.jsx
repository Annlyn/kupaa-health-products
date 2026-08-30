import { Link, useParams } from 'react-router-dom';
import { CheckCircle, PackageIcon, TruckIcon } from '../../components/Icons';
import { Badge, PageLoader, EmptyState } from '../../components/ui';
import { dateShort, money, statusClass } from '../../lib/format';
import { mediaUrl } from '../../api/client';
import { useFetch, useTitle } from '../../lib/hooks';

export default function OrderSuccess() {
  const { id } = useParams();
  const { data: order, loading } = useFetch(`/orders/${id}`, [id]);
  useTitle('Order confirmed');

  if (loading) return <PageLoader label="Confirming your order" />;
  if (!order) {
    return (
      <div className="container-page py-16">
        <EmptyState title="We could not find that order" action={<Link to="/account/orders" className="btn-primary">My orders</Link>} />
      </div>
    );
  }

  const paid = order.paymentStatus === 'PAID';

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle width={34} height={34} />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold">Thank you, your order is confirmed</h1>
        <p className="mt-2.5 text-sm text-ink-600">
          Order <span className="font-semibold text-ink-900">{order.orderNumber}</span> was placed on {dateShort(order.placedAt)}.
          {paid ? ' Payment received.' : order.paymentMethod === 'COD' ? ' Pay the courier on delivery.' : ' Awaiting payment confirmation.'}
        </p>
        <p className="mt-1 text-sm text-ink-500">A confirmation has been sent to {order.shipEmail}.</p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl space-y-5">
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Order summary</h2>
            <div className="flex gap-2">
              <Badge className={statusClass(order.status)}>{order.status}</Badge>
              <Badge className={statusClass(order.paymentStatus)}>{order.paymentStatus}</Badge>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-ink-50">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                  {item.image ? (
                    <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-ink-300">
                      <PackageIcon width={20} height={20} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-ink-900">{item.name}</p>
                  {item.variantName && <p className="text-xs font-medium text-brand-700">{item.variantName}</p>}
                  <p className="text-xs text-ink-500">
                    Qty {item.quantity} · {money(item.price)}
                  </p>
                </div>
                <span className="text-sm font-semibold">{money(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm">
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
            <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold text-ink-950">
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <TruckIcon width={18} height={18} /> Delivering to
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
          <p className="mt-3 text-xs text-ink-500">
            You will get an AWB tracking number by email as soon as the parcel is handed to the courier — usually within 24 hours.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to={`/account/orders/${order.id}`} className="btn-primary">
            Track this order
          </Link>
          <Link to="/shop" className="btn-outline">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
