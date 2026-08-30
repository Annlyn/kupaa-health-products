import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, qs } from '../../api/client';
import { SearchIcon, UsersIcon } from '../../components/Icons';
import { Badge, EmptyState, Modal, Pagination, Spinner, cx } from '../../components/ui';
import { dateShort, initials, money, statusClass } from '../../lib/format';
import { useDebounced, useFetch, useTitle } from '../../lib/hooks';

export default function AdminCustomers() {
  useTitle('Customers · Admin');
  const [params] = useSearchParams();

  const [search, setSearch] = useState(params.get('q') || '');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);

  const q = useDebounced(search, 350);
  const { data: users, meta, loading, reload } = useFetch(`/admin/users${qs({ q, role, page, limit: 20 })}`, [q, role, page]);
  const { data: detail } = useFetch(viewing ? `/admin/users/${viewing}` : null, [viewing]);

  const update = async (user, patch) => {
    try {
      await api.patch(`/admin/users/${user.id}`, patch);
      toast.success('Customer updated');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="mt-1 text-sm text-ink-500">{meta?.total ?? 0} accounts.</p>
        </div>
      </header>

      <div className="card flex flex-wrap gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={17} height={17} />
          <input
            className="input pl-10"
            placeholder="Search by name, email or phone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input w-auto"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All roles</option>
          <option value="USER">Customers</option>
          <option value="ADMIN">Admins</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : users?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th className="text-center">Orders</th>
                <th className="text-right">Lifetime value</th>
                <th className="text-center">Role</th>
                <th className="text-center">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{user.name}</p>
                        <p className="text-xs text-ink-500">Joined {dateShort(user.createdAt)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm">
                    <p className="truncate">{user.email}</p>
                    <p className="text-xs text-ink-500">{user.phone || '—'}</p>
                  </td>
                  <td className="text-center">{user.orderCount}</td>
                  <td className="text-right font-semibold">{money(user.totalSpent)}</td>
                  <td className="text-center">
                    <select
                      className={cx('rounded-md border border-ink-200 px-2 py-1 text-xs', user.role === 'ADMIN' && 'font-semibold text-brand-700')}
                      value={user.role}
                      onChange={(e) => update(user, { role: e.target.value })}
                    >
                      <option value="USER">Customer</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="text-center">
                    <Badge className={user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-outline btn-sm" onClick={() => setViewing(user.id)}>
                        View
                      </button>
                      <button
                        className={cx('btn-ghost btn-sm', user.isActive ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50')}
                        onClick={() => update(user, { isActive: !user.isActive })}
                      >
                        {user.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={UsersIcon} title="No customers found" description="Try a different search term." />
      )}

      <Pagination page={meta?.page ?? 1} pages={meta?.pages ?? 1} onChange={setPage} />

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Customer details" size="lg">
        {!detail ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 font-display text-lg font-bold text-brand-800">
                {initials(detail.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-ink-950">{detail.name}</p>
                <p className="text-sm text-ink-500">{detail.email}</p>
                <p className="text-sm text-ink-500">{detail.phone || 'No phone on file'}</p>
              </div>
              <Badge className={detail.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>
                {detail.isActive ? 'Active' : 'Disabled'}
              </Badge>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">Saved addresses ({detail.addresses.length})</h3>
              {detail.addresses.length ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {detail.addresses.map((a) => (
                    <li key={a.id} className="rounded-lg border border-ink-100 p-3 text-xs leading-relaxed text-ink-600">
                      <span className="font-semibold text-ink-900">{a.fullName}</span> · {a.label}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}
                      <br />
                      {a.city}, {a.state} {a.pincode} · {a.phone}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-400">None saved.</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">Recent orders</h3>
              {detail.orders.length ? (
                <div className="table-wrap mt-2">
                  <table className="table min-w-full">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.orders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link to={`/admin/orders/${order.id}`} className="font-medium text-brand-700 hover:underline" onClick={() => setViewing(null)}>
                              {order.orderNumber}
                            </Link>
                          </td>
                          <td className="text-xs">{dateShort(order.placedAt)}</td>
                          <td>
                            <Badge className={statusClass(order.status)}>{order.status}</Badge>
                          </td>
                          <td className="text-right font-semibold">{money(order.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink-400">No orders yet.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
