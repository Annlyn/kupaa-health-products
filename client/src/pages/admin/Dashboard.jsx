import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertIcon, PackageIcon, RupeeIcon, TruckIcon, UsersIcon } from '../../components/Icons';
import { Badge, EmptyState, PageLoader, StatTile } from '../../components/ui';
import { dateShort, money, relative, statusClass } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

const STATUS_ORDER = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-2 shadow-lift">
      <p className="text-xs font-medium text-ink-500">{dateShort(label)}</p>
      <p className="mt-0.5 text-sm font-bold text-ink-950">{money(payload[0].value)}</p>
      <p className="text-xs text-ink-500">{payload[0].payload.orders} order(s)</p>
    </div>
  );
}

export default function Dashboard() {
  useTitle('Admin dashboard');
  const { data, loading } = useFetch('/admin/stats');

  if (loading || !data) return <PageLoader label="Crunching numbers" />;

  const noRevenue = data.salesSeries.every((d) => d.revenue === 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">How the store is doing right now.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/products/new" className="btn-primary btn-sm">
            Add product
          </Link>
          <Link to="/admin/orders" className="btn-outline btn-sm">
            View orders
          </Link>
          <Link to="/admin/settings" className="btn-outline btn-sm">
            Store settings
          </Link>
        </div>
      </header>

      {(!data.integrations.razorpay || !data.integrations.shiprocket) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertIcon width={18} height={18} className="shrink-0" />
          <p className="flex-1">
            {!data.integrations.razorpay && 'Razorpay is not configured — only cash on delivery is available. '}
            {!data.integrations.shiprocket && 'Shiprocket is running in mock mode — shipments are simulated.'}
          </p>
          <Link to="/admin/integrations" className="btn-outline btn-sm shrink-0">
            Configure
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Revenue this month" value={money(data.revenueMonth)} sub={`${money(data.revenueTotal)} all time`} icon={RupeeIcon} />
        <StatTile label="Orders" value={data.orderCount} sub={`${data.pendingCount} awaiting fulfilment`} icon={TruckIcon} tone="violet" />
        <StatTile label="Customers" value={data.customerCount} sub={`Avg order ${money(data.avgOrderValue)}`} icon={UsersIcon} tone="amber" />
        <StatTile
          label="Active products"
          value={data.productCount}
          sub={data.lowStock.length ? `${data.lowStock.length} low on stock` : 'Stock levels healthy'}
          icon={PackageIcon}
          tone={data.lowStock.length ? 'rose' : 'brand'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Revenue — last 14 days</h2>
              <p className="text-xs text-ink-500">Paid, packed, shipped and delivered orders.</p>
            </div>
          </div>

          <div className="mt-5 h-64">
            {noRevenue ? (
              <div className="grid h-full place-items-center text-sm text-ink-400">No paid orders in the last 14 days yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesSeries} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b89d" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#14b89d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef1" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => new Date(v).getDate()}
                    tick={{ fontSize: 11, fill: '#8595a5' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                    tick={{ fontSize: 11, fill: '#8595a5' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#079480" strokeWidth={2} fill="url(#revenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Orders by status</h2>
          <ul className="mt-4 space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const count = data.statusCounts[status] ?? 0;
              const pct = data.orderCount ? (count / data.orderCount) * 100 : 0;
              return (
                <li key={status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-700">{status.charAt(0) + status.slice(1).toLowerCase()}</span>
                    <span className="text-ink-500">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <h3 className="mt-6 text-sm font-semibold text-ink-900">Top sellers</h3>
          {data.topProducts.length ? (
            <ol className="mt-2.5 space-y-2">
              {data.topProducts.map((p, i) => (
                <li key={p.productId ?? p.name} className="flex items-center gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-100 text-xs font-bold text-ink-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{p.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-ink-900">{p.unitsSold} sold</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-ink-400">No sales yet.</p>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <h2 className="text-base font-semibold">Recent orders</h2>
            <Link to="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">
              View all →
            </Link>
          </header>

          {data.recentOrders.length ? (
            <div className="table-wrap border-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <p className="font-medium text-ink-900">{order.user?.name ?? order.shipName}</p>
                        <p className="text-xs text-ink-500">{order.user?.email ?? '—'}</p>
                      </td>
                      <td>
                        <Badge className={statusClass(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="text-right font-semibold">{money(order.total)}</td>
                      <td className="text-right text-xs text-ink-500">{relative(order.placedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No orders yet" description="Orders will appear here as soon as customers start buying." />
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertIcon width={17} height={17} className="text-amber-500" /> Low stock alerts
          </h2>

          {data.lowStock.length ? (
            <ul className="mt-4 space-y-3">
              {data.lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/products/${p.id}`} className="line-clamp-1 text-sm font-medium text-ink-900 hover:text-brand-700">
                      {p.name}
                    </Link>
                    <p className="text-xs text-ink-500">SKU {p.sku}</p>
                  </div>
                  <span className={`badge shrink-0 ${p.stock === 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                    {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-400">Everything is comfortably in stock.</p>
          )}
        </section>
      </div>
    </div>
  );
}
