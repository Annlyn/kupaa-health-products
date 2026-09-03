import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import AccountNav from './AccountNav';
import { PackageIcon, TruckIcon } from '../../components/Icons';
import { Badge, Breadcrumbs, EmptyState, Pagination, Spinner } from '../../components/ui';
import { dateShort, money, statusClass } from '../../lib/format';
import { mediaUrl } from '../../api/client';
import { useFetch, useTitle } from '../../lib/hooks';

const FILTERS = [
  ['', 'All'],
  ['PENDING', 'Pending'],
  ['CONFIRMED', 'Confirmed'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
];

/** Reopens the Razorpay sheet for an order whose first payment attempt failed. */
async function retryPayment(order, onDone) {
  try {
    const { data: payment } = await api.post(`/payments/retry/${order.id}`);
    const rzp = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      order_id: payment.razorpayOrderId,
      prefill: payment.prefill,
      theme: { color: '#526B5A' },
      handler: async (response) => {
        try {
          await api.post('/payments/verify', {
            orderId: order.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          toast.success('Payment received');
          onDone?.();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
    rzp.open();
  } catch (err) {
    toast.error(err.message);
  }
}

export default function Orders() {
  useTitle('My orders');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: orders, meta, loading, reload } = useFetch(`/orders?page=${page}&limit=10${status ? `&status=${status}` : ''}`, [status, page]);
  const [cancelling, setCancelling] = useState(null);

  const cancel = async (order) => {
    setCancelling(order.id);
    try {
      await api.post(`/orders/${order.id}/cancel`, { reason: 'Cancelled by customer' });
      toast.success('Order cancelled');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My account', to: '/account' }, { label: 'Orders' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">My orders</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <AccountNav />

        <div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => (
              <button
                key={label}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
                className={
                  status === value
                    ? 'badge bg-brand-700 text-white'
                    : 'badge bg-ink-100 text-ink-600 hover:bg-ink-200'
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-7 w-7 text-brand-600" />
              </div>
            ) : orders?.length ? (
              orders.map((order) => (
                <article key={order.id} className="card overflow-hidden">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/50 px-5 py-3.5">
                    <div>
                      <Link to={`/account/orders/${order.id}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-ink-500">Placed on {dateShort(order.placedAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusClass(order.status)}>{order.status}</Badge>
                      <Badge className={statusClass(order.paymentStatus)}>
                        {order.paymentMethod === 'COD' ? 'COD' : 'Online'} · {order.paymentStatus}
                      </Badge>
                    </div>
                  </header>

                  <div className="flex flex-wrap items-center gap-4 p-5">
                    <div className="flex -space-x-2">
                      {order.items.slice(0, 4).map((item) => (
                        <span key={item.id} className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-ink-100">
                          {item.image ? (
                            <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-ink-400">
                              <PackageIcon width={18} height={18} />
                            </span>
                          )}
                        </span>
                      ))}
                      {order.items.length > 4 && (
                        <span className="grid h-12 w-12 place-items-center rounded-lg border-2 border-white bg-ink-100 text-xs font-semibold text-ink-600">
                          +{order.items.length - 4}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm text-ink-700">
                        {order.items.map((i) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} ×${i.quantity}`).join(', ')}
                      </p>
                      {order.shipment?.awbCode && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                          <TruckIcon width={14} height={14} /> Tracking {order.shipment.awbCode}
                          {order.shipment.courierName ? ` · ${order.shipment.courierName}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-ink-950">{money(order.total)}</p>
                      <p className="text-xs text-ink-500">{order.items.length} item(s)</p>
                    </div>
                  </div>

                  <footer className="flex flex-wrap gap-2 border-t border-ink-100 px-5 py-3">
                    <Link to={`/account/orders/${order.id}`} className="btn-outline btn-sm">
                      View details
                    </Link>
                    {order.shipment?.awbCode && (
                      <Link to={`/account/orders/${order.id}`} className="btn-secondary btn-sm">
                        Track shipment
                      </Link>
                    )}
                    {order.paymentMethod === 'RAZORPAY' && ['PENDING', 'FAILED'].includes(order.paymentStatus) && order.status !== 'CANCELLED' && (
                      <button className="btn-primary btn-sm" onClick={() => retryPayment(order, reload)}>
                        Complete payment
                      </button>
                    )}
                    {['PENDING', 'CONFIRMED'].includes(order.status) && (
                      <button className="btn-ghost btn-sm text-kupaa-black hover:bg-ink-200" onClick={() => cancel(order)} disabled={cancelling === order.id}>
                        {cancelling === order.id ? <Spinner className="h-3.5 w-3.5" /> : null} Cancel order
                      </button>
                    )}
                  </footer>
                </article>
              ))
            ) : (
              <EmptyState
                icon={PackageIcon}
                title="No orders yet"
                description="Once you place an order it will show up here with live tracking."
                action={
                  <Link to="/shop" className="btn-primary">
                    Start shopping
                  </Link>
                }
              />
            )}
          </div>

          <Pagination page={meta?.page ?? 1} pages={meta?.pages ?? 1} onChange={setPage} className="mt-8" />
        </div>
      </div>
    </div>
  );
}
