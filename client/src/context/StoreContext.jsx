import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const StoreContext = createContext(null);

/**
 * Storefront copy and commerce rules, all editable under Admin → Store settings.
 * Defaults mirror the server so the first paint is never blank if the request
 * is still in flight.
 */
const FALLBACK = {
  storeName: 'Kupaa Health Products',
  storeTagline: 'Everyday wellness, honestly made',
  supportEmail: 'support@kupaahealth.com',
  supportPhone: '',
  currency: 'INR',
  freeShippingAbove: 0,
  flatShippingFee: 59,
  taxPercent: 0,
  codEnabled: true,
  codExtraFee: 0,
  maxQtyPerItem: 20,
  whatsappNotifyOwner: true,
  whatsappSendInvoice: true,
  announcementEnabled: false,
  announcementText: '',
  heroBadge: '',
  heroTitle: '',
  heroTitleAccent: '',
  heroSubtitle: '',
  heroPrimaryLabel: 'Shop all products',
  heroPrimaryHref: '/shop',
  heroSecondaryLabel: '',
  heroSecondaryHref: '/shop',
  heroStats: [],
  heroCards: [],
  trustItems: [],
  categoriesTitle: 'Shop by goal',
  categoriesSubtitle: '',
  featuredTitle: 'Bestsellers',
  featuredSubtitle: '',
  newestTitle: 'New in store',
  newestSubtitle: '',
  promoEnabled: false,
  promoTitle: '',
  promoBody: '',
  promoBullets: [],
  promoCtaLabel: '',
  promoCtaHref: '/shop',
  faqEnabled: false,
  faqTitle: 'Frequently asked questions',
  faqSubtitle: '',
  faqItems: [],
  socialEnabled: false,
  socialTitle: 'From our feed',
  socialSubtitle: '',
  socialInstagramUrl: '',
  socialYoutubeUrl: '',
  socialFacebookUrl: '',
  footerBlurb: '',
  footerPromises: [],
  footerNote: '',
  policyShipping: '',
  policyReturns: '',
  policyPrivacy: '',
  policyTerms: '',
  policyContact: '',
};

const SESSION_KEY = 'kupaa_store_settings';

/** Last session's copy, so the header and footer paint before the request lands. */
function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? { ...FALLBACK, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }) {
  const cached = readSessionCache();
  const [settings, setSettings] = useState(cached ?? FALLBACK);
  const [loading, setLoading] = useState(!cached);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/store', { fresh: true });
      const next = { ...FALLBACK, ...data };
      setSettings(next);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      } catch {
        // private mode / quota — the in-memory copy is enough
      }
    } catch {
      // Keep whatever we have — the catalogue still works without it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({ settings, loading, reload }), [settings, loading, reload]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx.settings;
};

export const useStoreContext = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStoreContext must be used inside <StoreProvider>');
  return ctx;
};

/** Splits an admin-edited text block into paragraphs. */
export const paragraphs = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
