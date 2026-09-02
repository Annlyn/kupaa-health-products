import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { CheckCircle, PackageIcon, SearchIcon, TruckIcon } from '../../components/Icons';
import { Breadcrumbs, EmptyState, Spinner } from '../../components/ui';
import { useTitle } from '../../lib/hooks';

export default function TrackOrder() {
  useTitle('Track your shipment');
  const [awb, setAwb] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!awb.trim()) return;
    setBusy(true);
    setSearched(true);
    try {
      const { data } = await api.get(`/shipping/track/${encodeURIComponent(awb.trim())}`);
      setResult(data);
    } catch (err) {
      toast.error(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Track order' }]} />

      <div className="mx-auto mt-6 max-w-2xl">
        <h1 className="text-2xl font-bold sm:text-3xl">Track your shipment</h1>
        <p className="mt-2 text-sm text-ink-600">
          Enter the Amazon Shipping tracking number from your dispatch email. Signed in?{' '}
          <Link to="/account/orders" className="font-semibold text-brand-700 hover:underline">
            Track from My Orders
          </Link>{' '}
          instead — no number needed.
        </p>

        <form onSubmit={submit} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
            <input
              className="input pl-10"
              placeholder="e.g. 1234567890123"
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              aria-label="Tracking number"
            />
          </div>
          <button className="btn-primary shrink-0" disabled={busy || !awb.trim()}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Track'}
          </button>
        </form>

        {result && (
          <div className="mt-8 card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Current status</p>
                <p className="mt-1 flex items-center gap-2 text-xl font-bold text-ink-950">
                  <TruckIcon width={20} height={20} className="text-brand-700" /> {result.status}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Tracking {result.awb}
                  {result.courier ? ` · ${result.courier}` : ''}
                </p>
              </div>
              {result.edd && (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Expected by</p>
                  <p className="mt-1 font-semibold text-ink-900">{result.edd}</p>
                </div>
              )}
            </div>

            {result.mock && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Amazon Shipping credentials are not configured, so this is simulated tracking data.
              </p>
            )}

            {result.activities?.length > 0 && (
              <ol className="mt-6 space-y-0">
                {result.activities.map((a, i) => (
                  <li key={`${a.date}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full ${
                          i === 0 ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-500'
                        }`}
                      >
                        {i === 0 ? <CheckCircle width={15} height={15} /> : <PackageIcon width={14} height={14} />}
                      </span>
                      {i < result.activities.length - 1 && <span className="mt-1 w-px flex-1 bg-ink-100" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-semibold text-ink-900">{a.activity || a.status}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {a.location ? `${a.location} · ` : ''}
                        {a.date}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {result.trackUrl && (
              <a href={result.trackUrl} target="_blank" rel="noreferrer" className="btn-outline mt-4 w-full">
                Open courier tracking page
              </a>
            )}
          </div>
        )}

        {searched && !busy && !result && (
          <div className="mt-8">
            <EmptyState
              icon={PackageIcon}
              title="No shipment found for that tracking number"
              description="Double-check the number in your dispatch email. Tracking can take a few hours to appear after pickup."
            />
          </div>
        )}
      </div>
    </div>
  );
}
