import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, qs } from '../../api/client';
import { DownloadIcon, SearchIcon, TruckIcon } from '../../components/Icons';
import { Badge, EmptyState, Pagination, Spinner, cx } from '../../components/ui';
import { dateShort, money, statusClass } from '../../lib/format';
import { useDebounced, useFetch, useTitle } from '../../lib/hooks';
import toast from 'react-hot-toast';

const STATUSES = ['all', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const PAYMENT_STATUSES = ['all', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'];

export default function AdminOrders() {
  useTitle('Orders · Admin');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [downloadingLabel, setDownloadingLabel] = useState(null);

  const q = useDebounced(search, 350);
  const path = `/admin/orders${qs({ q, status, paymentStatus, from: range.from, to: range.to, page, limit: 20 })}`;
  const { data: orders, meta, loading } = useFetch(path, [q, status, paymentStatus, range.from, range.to, page]);

  /** The API needs a bearer token, so the file comes through the api client. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      await download(`/admin/orders/export.csv${qs({ status })}`, `kupaa-orders-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const downloadLabel = async (order) => {
    setDownloadingLabel(order.id);
    try {
      await download(`/admin/orders/${order.id}/label`, `LABEL-${order.orderNumber}.pdf`);
      toast.success('Shipping label downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloadingLabel(null);
    }
  };

  const reset = (fn) => (value) => {
    fn(value);
    setPage(1);
  };

  const setDateRange = (key, value) => {
    setRange((r) => ({ ...r, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="mt-1 text-sm text-ink-500">
            {meta?.total ?? 0} orders · {money(meta?.revenue ?? 0)} in this view
          </p>
        </div>
        <button className="btn-outline" onClick={exportCsv} disabled={exporting}>
          {exporting ? <Spinner className="h-4 w-4" /> : <DownloadIcon width={16} height={16} />} Export CSV
        </button>
      </header>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={17} height={17} />
            <input
              className="input pl-10"
              placeholder="Order number, customer, phone or AWB"
              value={search}
              onChange={(e) => reset(setSearch)(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={paymentStatus} onChange={(e) => reset(setPaymentStatus)(e.target.value)}>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All payments' : `Payment: ${s}`}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input w-auto"
            value={range.from}
            onChange={(e) => setDateRange('from', e.target.value)}
            aria-label="From date"
          />
          <input
            type="date"
            className="input w-auto"
            value={range.to}
            onChange={(e) => setDateRange('to', e.target.value)}
            aria-label="To date"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => reset(setStatus)(s)}
              className={cx('badge', status === s ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
            >
              {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : orders?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Shipment</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/admin/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-ink-500">{dateShort(order.placedAt)}</p>
                  </td>
                  <td>
                    <p className="font-medium text-ink-900">{order.shipName}</p>
                    <p className="text-xs text-ink-500">
                      {order.shipCity}, {order.shipPincode}
                    </p>
                  </td>
                  <td className="text-sm text-ink-600">{order.items.length}</td>
                  <td>
                    <Badge className={statusClass(order.status)}>{order.status}</Badge>
                  </td>
                  <td>
                    <Badge className={statusClass(order.paymentStatus)}>{order.paymentStatus}</Badge>
                    <p className="mt-0.5 text-xs text-ink-500">{order.paymentMethod === 'COD' ? 'COD' : 'Online'}</p>
                  </td>
                  <td className="text-xs">
                    {order.shipment?.awbCode ? (
                      <div className="space-y-1.5">
                        <span className="flex items-center gap-1.5 text-ink-700">
                          <TruckIcon width={14} height={14} /> {order.shipment.awbCode}
                        </span>
                        {order.shipment.carrierShipmentId && (
                          <button
                            className="inline-flex items-center gap-1 text-brand-700 hover:underline disabled:opacity-50"
                            onClick={() => downloadLabel(order)}
                            disabled={downloadingLabel === order.id}
                          >
                            <DownloadIcon width={13} height={13} />
                            {downloadingLabel === order.id ? 'Downloading...' : 'Download label'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-400">Not shipped</span>
                    )}
                  </td>
                  <td className="text-right font-semibold">{money(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={TruckIcon} title="No orders match these filters" description="Try clearing the search or date range." />
      )}

      <Pagination page={meta?.page ?? 1} pages={meta?.pages ?? 1} onChange={setPage} />
    </div>
  );
}
