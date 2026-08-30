import { Link } from 'react-router-dom';
import { AlertIcon, CheckCircle, SettingsIcon, ShieldIcon, TruckIcon } from '../../components/Icons';
import { Badge, PageLoader, cx } from '../../components/ui';
import { money } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

function StatusPill({ ok, okLabel = 'Connected', offLabel = 'Not configured' }) {
  return (
    <Badge className={ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
      {ok ? <CheckCircle width={13} height={13} /> : <AlertIcon width={13} height={13} />}
      {ok ? okLabel : offLabel}
    </Badge>
  );
}

function EnvRow({ name, note }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-50 py-2 last:border-0">
      <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-800">{name}</code>
      <span className="text-xs text-ink-500">{note}</span>
    </li>
  );
}

export default function Integrations() {
  useTitle('Integrations · Admin');
  const { data, loading } = useFetch('/admin/integrations');

  if (loading || !data) return <PageLoader label="Checking integrations" />;

  const origin = window.location.origin;

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-ink-500">
          Payments and shipping are configured through environment variables on the API server, never in the browser. Update{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs">server/.env</code> and restart to apply changes.
        </p>
      </header>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldIcon width={20} height={20} className="text-brand-700" /> Razorpay — payments
          </h2>
          <StatusPill ok={data.razorpay.enabled} />
        </div>

        <p className="mt-3 text-sm text-ink-600">
          Handles UPI, cards, netbanking and wallets. Orders stay <strong>PENDING</strong> until the payment signature is verified
          server-side, so a spoofed success callback can never confirm an order.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Key ID</dt>
            <dd className="font-medium">{data.razorpay.keyId || 'Not set'}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Webhook secret</dt>
            <dd className="font-medium">{data.razorpay.webhookConfigured ? 'Configured' : 'Not set'}</dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Environment variables</h3>
            <ul className="mt-2">
              <EnvRow name="RAZORPAY_KEY_ID" note="Dashboard → Settings → API keys" />
              <EnvRow name="RAZORPAY_KEY_SECRET" note="Shown once when you generate the key" />
              <EnvRow name="RAZORPAY_WEBHOOK_SECRET" note="Set the same value in the webhook form" />
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Webhook endpoint</h3>
            <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-xs text-brand-200">
              {origin}/api/payments/webhook
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Subscribe to <code className="font-mono">payment.captured</code>, <code className="font-mono">payment.failed</code> and{' '}
              <code className="font-mono">refund.processed</code>. The webhook is the safety net: if a customer closes the browser
              mid-payment, it still confirms the order.
            </p>
          </div>
        </div>

        {!data.razorpay.enabled && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            Without keys the storefront only offers cash on delivery. Razorpay test keys (<code className="font-mono">rzp_test_…</code>)
            work fine for development.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TruckIcon width={20} height={20} className="text-brand-700" /> Shiprocket — shipping
          </h2>
          <StatusPill ok={data.shiprocket.enabled} okLabel="Live" offLabel="Mock mode" />
        </div>

        <p className="mt-3 text-sm text-ink-600">
          Powers PIN-code serviceability, courier rate comparison, AWB assignment, pickup scheduling, labels and tracking. In mock
          mode every call returns realistic simulated data so you can exercise the full flow before going live.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Pickup location</dt>
            <dd className="font-medium">{data.shiprocket.pickupLocation}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Origin PIN code</dt>
            <dd className="font-medium">{data.shiprocket.pickupPincode}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Webhook token</dt>
            <dd className="font-medium">{data.shiprocket.webhookConfigured ? 'Configured' : 'Not set'}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Pickup addresses</dt>
            <dd className="font-medium">{data.shiprocket.pickupLocations?.length ?? 0} on file</dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Environment variables</h3>
            <ul className="mt-2">
              <EnvRow name="SHIPROCKET_EMAIL" note="API user, not your login" />
              <EnvRow name="SHIPROCKET_PASSWORD" note="Settings → API → Configure" />
              <EnvRow name="SHIPROCKET_PICKUP_LOCATION" note="Nickname of your warehouse" />
              <EnvRow name="SHIPROCKET_PICKUP_PINCODE" note="Origin for rate checks" />
              <EnvRow name="SHIPROCKET_WEBHOOK_TOKEN" note="Shared secret for status pushes" />
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Webhook endpoint</h3>
            <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-xs text-brand-200">
              {origin}/api/shipping/webhook
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Add this under Settings → API → Webhooks with the same token in the <code className="font-mono">x-api-key</code> header.
              Courier scans then update order status automatically.
            </p>
          </div>
        </div>

        {data.shiprocket.pickupLocations?.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-ink-900">Pickup addresses on file</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.shiprocket.pickupLocations.map((loc, i) => (
                <li key={loc.pickup_location ?? i} className="rounded-lg border border-ink-100 p-3 text-xs text-ink-600">
                  <span className="font-semibold text-ink-900">{loc.pickup_location}</span>
                  <br />
                  {loc.city} {loc.pin_code}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <SettingsIcon width={20} height={20} className="text-brand-700" /> Store rules
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          These drive checkout pricing.{' '}
          <Link to="/admin/settings" className="font-semibold text-brand-700 hover:underline">
            Edit them under Store settings
          </Link>{' '}
          — <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs">server/.env</code> only supplies the defaults.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Store name', data.store.storeName],
            ['Support email', data.store.supportEmail],
            ['Currency', data.store.currency],
            ['Free shipping above', money(data.store.freeShippingAbove)],
            ['Flat shipping fee', money(data.store.flatShippingFee)],
            ['Tax percent', `${data.store.taxPercent}%`],
            ['Cash on delivery', data.store.codEnabled ? 'Enabled' : 'Disabled'],
            ['COD handling fee', money(data.store.codExtraFee)],
          ].map(([label, value]) => (
            <div key={label} className={cx('flex justify-between gap-4 border-b border-ink-50 py-2')}>
              <dt className="text-ink-500">{label}</dt>
              <dd className="text-right font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
