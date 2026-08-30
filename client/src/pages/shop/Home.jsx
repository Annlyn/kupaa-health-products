import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import { CheckCircle, ChevronRight, LeafIcon, PackageIcon, ShieldIcon, TruckIcon } from '../../components/Icons';
import { SkeletonCard } from '../../components/ui';
import { mediaUrl } from '../../api/client';
import { useStore } from '../../context/StoreContext';
import { useFetchOnVisible, useTitle } from '../../lib/hooks';

// The trust strip and footer promises are admin-editable text; the icons cycle
// through this set so the layout stays balanced whatever is entered.
const TRUST_ICONS = [ShieldIcon, LeafIcon, TruckIcon, PackageIcon];

function Hero({ settings }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 20%, rgba(95,233,206,.5), transparent 45%), radial-gradient(circle at 82% 70%, rgba(20,184,157,.45), transparent 50%)',
        }}
      />
      <div className="container-page relative grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div className="animate-fade-up">
          {settings.heroBadge && <span className="badge bg-white/10 text-brand-100 ring-1 ring-white/20">{settings.heroBadge}</span>}

          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
            {settings.heroTitle}
            {settings.heroTitleAccent && <span className="block text-brand-300">{settings.heroTitleAccent}</span>}
          </h1>

          {settings.heroSubtitle && <p className="mt-5 max-w-lg text-base leading-relaxed text-brand-100/90">{settings.heroSubtitle}</p>}

          <div className="mt-8 flex flex-wrap gap-3">
            {settings.heroPrimaryLabel && (
              <Link to={settings.heroPrimaryHref || '/shop'} className="btn bg-white px-6 py-3 text-brand-900 hover:bg-brand-50">
                {settings.heroPrimaryLabel} <ChevronRight width={17} height={17} />
              </Link>
            )}
            {settings.heroSecondaryLabel && (
              <Link
                to={settings.heroSecondaryHref || '/shop'}
                className="btn border border-white/30 px-6 py-3 text-white hover:bg-white/10"
              >
                {settings.heroSecondaryLabel}
              </Link>
            )}
          </div>

          {settings.heroStats?.length > 0 && (
            <dl className="mt-10 grid max-w-md gap-6 border-t border-white/15 pt-6" style={{ gridTemplateColumns: `repeat(${settings.heroStats.length}, minmax(0, 1fr))` }}>
              {settings.heroStats.map((stat) => (
                <div key={stat.label || stat.value}>
                  <dt className="text-xl font-bold text-white">{stat.value}</dt>
                  <dd className="mt-0.5 text-xs text-brand-200">{stat.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {settings.heroCards?.length > 0 && (
          <div className="relative hidden md:block">
            <div className="absolute -inset-6 rounded-[2rem] bg-white/5 backdrop-blur-sm" />
            <div className="relative grid grid-cols-2 gap-4">
              {settings.heroCards.map((card, i) => (
                <div
                  key={card.title || i}
                  className="rounded-2xl bg-white/95 p-5 shadow-lift"
                  style={{ transform: `translateY(${i % 2 ? '1.5rem' : '0'})` }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-800">
                    <LeafIcon width={18} height={18} />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink-950">{card.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{card.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const settings = useStore();
  useTitle(settings.storeTagline);

  // The hero renders from settings alone. Each section below fetches only once
  // it scrolls near the viewport, so first paint costs no product requests.
  const categorySection = useFetchOnVisible('/categories');
  const featuredSection = useFetchOnVisible('/products?featured=true&limit=4');
  const newestSection = useFetchOnVisible('/products?sort=newest&limit=8');

  return (
    <>
      <Hero settings={settings} />

      {settings.trustItems?.length > 0 && (
        <section className="border-b border-ink-100 bg-white">
          <div className="container-page grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
            {settings.trustItems.map((item, i) => {
              const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
              return (
                <div key={item.title || i} className="flex gap-3">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon width={19} height={19} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.copy}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section ref={categorySection.ref} className="container-page py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">{settings.categoriesTitle}</h2>
            {settings.categoriesSubtitle && <p className="mt-1.5 text-sm text-ink-500">{settings.categoriesSubtitle}</p>}
          </div>
          <Link to="/shop" className="hidden shrink-0 text-sm font-semibold text-brand-700 hover:underline sm:block">
            View all →
          </Link>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(categorySection.data || []).map((cat) => (
            <Link
              key={cat.id}
              to={`/shop?category=${cat.slug}`}
              className="group relative overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="aspect-[16/9] overflow-hidden bg-ink-50">
                {cat.image && (
                  <img src={mediaUrl(cat.image)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink-950 group-hover:text-brand-700">{cat.name}</h3>
                  <span className="badge bg-ink-100 text-ink-600">{cat.productCount}</span>
                </div>
                {cat.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{cat.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section ref={featuredSection.ref} className="bg-ink-50/60 py-14">
        <div className="container-page">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">{settings.featuredTitle}</h2>
              {settings.featuredSubtitle && <p className="mt-1.5 text-sm text-ink-500">{settings.featuredSubtitle}</p>}
            </div>
            <Link to="/shop?featured=true" className="hidden shrink-0 text-sm font-semibold text-brand-700 hover:underline sm:block">
              View all →
            </Link>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featuredSection.data
              ? featuredSection.data.map((p) => <ProductCard key={p.id} product={p} />)
              : Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>

      <section ref={newestSection.ref} className="container-page py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">{settings.newestTitle}</h2>
            {settings.newestSubtitle && <p className="mt-1.5 text-sm text-ink-500">{settings.newestSubtitle}</p>}
          </div>
          <Link to="/shop" className="hidden shrink-0 text-sm font-semibold text-brand-700 hover:underline sm:block">
            Browse everything →
          </Link>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {newestSection.data
            ? newestSection.data.map((p) => <ProductCard key={p.id} product={p} />)
            : Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </section>

      {settings.promoEnabled && (
        <section className="container-page pb-16">
          <div className="overflow-hidden rounded-2xl bg-brand-900 px-6 py-12 text-center sm:px-12">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">{settings.promoTitle}</h2>
            {settings.promoBody && <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-100/90">{settings.promoBody}</p>}

            {settings.promoBullets?.length > 0 && (
              <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-brand-100">
                {settings.promoBullets.map((bullet, i) => (
                  <li key={bullet.text || i} className="flex items-center gap-2">
                    <CheckCircle width={17} height={17} className="text-brand-300" /> {bullet.text}
                  </li>
                ))}
              </ul>
            )}

            {settings.promoCtaLabel && (
              <Link to={settings.promoCtaHref || '/shop'} className="btn mt-8 bg-white px-6 py-3 text-brand-900 hover:bg-brand-50">
                {settings.promoCtaLabel} <ChevronRight width={16} height={16} />
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
