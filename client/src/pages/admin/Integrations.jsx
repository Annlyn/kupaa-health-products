import { Link } from 'react-router-dom';
import { AlertIcon, CheckCircle, MailIcon, SettingsIcon, ShieldIcon, TruckIcon } from '../../components/Icons';
import { Badge, PageLoader, cx } from '../../components/ui';
import { money } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

function StatusPill({ ok, okLabel = 'Connected', offLabel = 'Not configured' }) {
  return (
    <Badge className={ok ? 'bg-brand-50 text-brand-700' : 'bg-ink-50 text-ink-700'}>
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
          <p className="mt-4 rounded-lg bg-ink-50 px-3.5 py-3 text-sm text-ink-900">
            Without keys the storefront only offers cash on delivery. Razorpay test keys (<code className="font-mono">rzp_test_…</code>)
            work fine for development.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TruckIcon width={20} height={20} className="text-brand-700" /> Amazon Shipping — delivery
          </h2>
          <StatusPill ok={data.shipping.enabled} okLabel="Live" offLabel="Mock mode" />
        </div>

        <p className="mt-3 text-sm text-ink-600">
          Powers PIN-code serviceability, the rate card, label purchase and tracking, through the SP-API Shipping v2
          endpoints. Nothing is created on Amazon&apos;s side until a label is bought, and Amazon collects from your
          registered pickup address on its own round — there is no pickup to schedule. In mock mode every call returns
          realistic simulated data so you can exercise the full flow before going live.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">SP-API endpoint</dt>
            <dd className="truncate pl-3 font-medium">{data.shipping.endpoint}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Carrier ID</dt>
            <dd className="font-medium">{data.shipping.carrierId}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Pickup PIN code</dt>
            <dd className="font-medium">{data.shipping.shipFrom?.postalCode}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Webhook token</dt>
            <dd className="font-medium">{data.shipping.webhookConfigured ? 'Configured' : 'Not set'}</dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Environment variables</h3>
            <ul className="mt-2">
              <EnvRow name="AMAZON_LWA_CLIENT_ID" note="Seller Central → Develop Apps" />
              <EnvRow name="AMAZON_LWA_CLIENT_SECRET" note="Shown once when the app is created" />
              <EnvRow name="AMAZON_LWA_REFRESH_TOKEN" note="From authorising the app" />
              <EnvRow name="AMAZON_SPAPI_ENDPOINT" note="India is served by the eu region" />
              <EnvRow name="AMAZON_SHIP_FROM_*" note="Full pickup address for rate quotes" />
              <EnvRow name="SHIPPING_WEBHOOK_TOKEN" note="Shared secret for status pushes" />
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Status webhook</h3>
            <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-xs text-brand-200">
              {origin}/api/shipping/webhook
            </p>
            <p className="mt-2 text-xs text-ink-500">
              SP-API delivers shipment notifications to EventBridge or SQS rather than calling a URL, so point your relay
              at this endpoint and send the same token in the <code className="font-mono">x-api-key</code> header. Carrier
              scans then update order status automatically.
            </p>
          </div>
        </div>

        {data.shipping.shipFrom && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-ink-900">Pickup address used for quotes</h3>
            <address className="mt-2 rounded-lg border border-ink-100 p-3 text-xs not-italic leading-relaxed text-ink-600">
              <span className="font-semibold text-ink-900">{data.shipping.shipFrom.name}</span>
              <br />
              {data.shipping.shipFrom.addressLine1}
              {data.shipping.shipFrom.addressLine2 ? `, ${data.shipping.shipFrom.addressLine2}` : ''}
              <br />
              {data.shipping.shipFrom.city}, {data.shipping.shipFrom.stateOrRegion} {data.shipping.shipFrom.postalCode}
              <br />
              {data.shipping.shipFrom.countryCode} · {data.shipping.shipFrom.phoneNumber}
            </address>
          </div>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MailIcon width={20} height={20} className="text-brand-700" /> WhatsApp — order alerts &amp; invoices
          </h2>
          <StatusPill ok={data.whatsapp.enabled} okLabel="Live" offLabel="Mock mode" />
        </div>

        <p className="mt-3 text-sm text-ink-600">
          Sends you a message the moment an order is placed, and the invoice PDF to the customer once an online payment
          clears. Turn either off under{' '}
          <Link to="/admin/settings" className="font-semibold text-brand-700 hover:underline">
            Store settings → WhatsApp notifications
          </Link>
          . In mock mode nothing leaves the server — every message is written to the log and to the order timeline, so the
          flow is still testable.
        </p>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Phone number ID</dt>
            <dd className="font-medium">{data.whatsapp.phoneNumberId || 'Not set'}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Your number (alerts)</dt>
            <dd className="font-medium">{data.whatsapp.ownerNumber || 'Not set'}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Graph API version</dt>
            <dd className="font-medium">{data.whatsapp.apiVersion}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-50 py-1.5">
            <dt className="text-ink-500">Template language</dt>
            <dd className="font-medium">{data.whatsapp.templateLanguage}</dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Environment variables</h3>
            <ul className="mt-2">
              <EnvRow name="WHATSAPP_PHONE_NUMBER_ID" note="Meta for Developers → WhatsApp → API setup" />
              <EnvRow name="WHATSAPP_ACCESS_TOKEN" note="Permanent system-user token" />
              <EnvRow name="WHATSAPP_OWNER_NUMBER" note="Where new order alerts go" />
              <EnvRow name="WHATSAPP_TEMPLATE_NEW_ORDER" note="Approved template for order alerts" />
              <EnvRow name="WHATSAPP_TEMPLATE_PAYMENT_RECEIVED" note="Approved template for payment alerts" />
              <EnvRow name="WHATSAPP_TEMPLATE_INVOICE" note="Approved template with a document header" />
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Message templates</h3>
            <ul className="mt-2">
              {[
                ['New order', data.whatsapp.templates?.newOrder, 'order no · total · payment · customer · city · items'],
                ['Payment received', data.whatsapp.templates?.paymentReceived, 'order no · total · customer'],
                ['Invoice', data.whatsapp.templates?.invoice, 'customer · order no · total, document header'],
              ].map(([label, name, params]) => (
                <li key={label} className="border-b border-ink-50 py-2 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink-900">{label}</span>
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-800">
                      {name || 'plain text'}
                    </code>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">Placeholders in order: {params}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">
              Meta only allows free-form text inside the 24 hours after a customer messages you, so live sending needs
              approved templates. Name one above and it is used; leave it blank and that message falls back to plain
              text, which is enough for test numbers.
            </p>
          </div>
        </div>
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
