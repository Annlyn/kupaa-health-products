import { Breadcrumbs } from '../../components/ui';
import { paragraphs, useStore } from '../../context/StoreContext';
import { useTitle } from '../../lib/hooks';

const SECTIONS = [
  { id: 'shipping', title: 'Shipping & delivery', key: 'policyShipping' },
  { id: 'returns', title: 'Returns & refunds', key: 'policyReturns' },
  { id: 'privacy', title: 'Privacy policy', key: 'policyPrivacy' },
  { id: 'terms', title: 'Terms of service', key: 'policyTerms' },
  { id: 'contact', title: 'Contact us', key: 'policyContact' },
];

export default function Policies() {
  useTitle('Policies & help');
  const settings = useStore();

  const sections = SECTIONS.map((section) => ({ ...section, body: paragraphs(settings[section.key]) })).filter(
    (section) => section.body.length > 0,
  );

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Policies' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Policies & help</h1>
      <p className="mt-1.5 text-sm text-ink-500">Everything about shipping, returns, privacy and getting hold of us.</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Policy sections" className="lg:sticky lg:top-40 lg:h-fit">
          <ul className="space-y-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-brand-700">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-12">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-44">
              <h2 className="text-xl font-bold">{s.title}</h2>
              <div className="mt-3 space-y-3">
                {s.body.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink-600">
                    {para}
                  </p>
                ))}
              </div>

              {s.id === 'contact' && (
                <dl className="mt-4 space-y-1.5 text-sm">
                  {settings.supportEmail && (
                    <div className="flex gap-2">
                      <dt className="text-ink-500">Email:</dt>
                      <dd>
                        <a href={`mailto:${settings.supportEmail}`} className="font-medium text-brand-700 hover:underline">
                          {settings.supportEmail}
                        </a>
                      </dd>
                    </div>
                  )}
                  {settings.supportPhone && (
                    <div className="flex gap-2">
                      <dt className="text-ink-500">Phone:</dt>
                      <dd className="font-medium text-ink-900">{settings.supportPhone}</dd>
                    </div>
                  )}
                </dl>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
