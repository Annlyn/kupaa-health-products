import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useStore } from './StoreContext';

const CartContext = createContext(null);
const GUEST_KEY = 'kupaa_guest_cart';
const COUPON_KEY = 'kupaa_coupon';

const readGuestCart = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(raw)
      ? raw.filter((r) => r?.productId && r?.quantity > 0).map((r) => ({ ...r, variantId: r.variantId ?? null }))
      : [];
  } catch {
    return [];
  }
};

/** A guest row is identified by product + chosen option, not product alone. */
const sameLine = (row, productId, variantId) => row.productId === productId && (row.variantId ?? null) === (variantId ?? null);
const writeGuestCart = (rows) => localStorage.setItem(GUEST_KEY, JSON.stringify(rows));

const EMPTY_TOTALS = {
  itemCount: 0,
  subtotal: 0,
  discount: 0,
  shippingFee: 0,
  tax: 0,
  total: 0,
  couponCode: null,
  amountToFreeShipping: 0,
};

/**
 * One cart API for both guests and signed-in shoppers.
 *
 * Guests keep line items in localStorage but still get prices from the server
 * (`POST /cart/quote`) so a tampered cart can never change what is charged.
 * On sign-in the guest rows are merged into the server cart and cleared.
 */
export function CartProvider({ children }) {
  const { isAuthenticated, booting } = useAuth();
  const { maxQtyPerItem } = useStore();

  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [coupon, setCoupon] = useState(() => localStorage.getItem(COUPON_KEY) || '');
  const [couponError, setCouponError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mergedRef = useRef(false);

  const applyResponse = useCallback((data) => {
    setItems(data.items || []);
    setTotals(data.totals || EMPTY_TOTALS);
    setCouponError(data.couponError || null);
    if (data.couponError) {
      setCoupon('');
      localStorage.removeItem(COUPON_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    // A guest with an empty localStorage cart has nothing to price — the answer
    // is known locally, so first-time visitors make no cart request at all.
    if (!isAuthenticated && readGuestCart().length === 0) {
      setItems([]);
      setTotals(EMPTY_TOTALS);
      setCouponError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (isAuthenticated) {
        const { data } = await api.get(`/cart${coupon ? `?couponCode=${encodeURIComponent(coupon)}` : ''}`, { fresh: true });
        applyResponse(data);
      } else {
        const { data } = await api.post('/cart/quote', { items: readGuestCart(), couponCode: coupon || undefined });
        applyResponse(data);
      }
    } catch {
      setItems([]);
      setTotals(EMPTY_TOTALS);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, coupon, applyResponse]);

  // Merge the guest cart exactly once, right after sign-in.
  useEffect(() => {
    if (booting) return;

    (async () => {
      if (isAuthenticated && !mergedRef.current) {
        mergedRef.current = true;
        const guest = readGuestCart();
        if (guest.length) {
          try {
            const { data } = await api.post('/cart/merge', { items: guest });
            writeGuestCart([]);
            applyResponse(data);
            toast.success('Your saved cart is ready');
            setLoading(false);
            return;
          } catch {
            /* fall through to a plain refresh */
          }
        }
      }
      if (!isAuthenticated) mergedRef.current = false;
      await refresh();
    })();
  }, [booting, isAuthenticated, refresh, applyResponse]);

  const add = useCallback(
    async (product, quantity = 1, variantId = null) => {
      const productId = product.id ?? product;
      const variant = product.variants?.find((v) => v.id === variantId);

      try {
        if (isAuthenticated) {
          const { data } = await api.post('/cart', { productId, variantId, quantity });
          applyResponse(data);
        } else {
          const rows = readGuestCart();
          const existing = rows.find((r) => sameLine(r, productId, variantId));
          if (existing) existing.quantity = Math.min(existing.quantity + quantity, maxQtyPerItem);
          else rows.push({ productId, variantId, quantity });
          writeGuestCart(rows);
          await refresh();
        }
        const label = product.name ? `${product.name}${variant ? ` (${variant.name})` : ''} added` : 'Added to cart';
        toast.success(label);
        setDrawerOpen(true);
      } catch (err) {
        toast.error(err.message);
        throw err;
      }
    },
    [isAuthenticated, applyResponse, refresh, maxQtyPerItem],
  );

  const setQuantity = useCallback(
    async (line, quantity) => {
      try {
        if (isAuthenticated) {
          const { data } = await api.patch(`/cart/${line.id}`, { quantity });
          applyResponse(data);
        } else {
          const rows = readGuestCart().filter((r) => (sameLine(r, line.productId, line.variantId) ? quantity > 0 : true));
          const row = rows.find((r) => sameLine(r, line.productId, line.variantId));
          if (row) row.quantity = quantity;
          writeGuestCart(rows);
          await refresh();
        }
      } catch (err) {
        toast.error(err.message);
      }
    },
    [isAuthenticated, applyResponse, refresh],
  );

  const remove = useCallback(
    async (line) => {
      try {
        if (isAuthenticated) {
          const { data } = await api.del(`/cart/${line.id}`);
          applyResponse(data);
        } else {
          writeGuestCart(readGuestCart().filter((r) => !sameLine(r, line.productId, line.variantId)));
          await refresh();
        }
        toast.success('Removed from cart');
      } catch (err) {
        toast.error(err.message);
      }
    },
    [isAuthenticated, applyResponse, refresh],
  );

  const clear = useCallback(async () => {
    if (isAuthenticated) await api.del('/cart').catch(() => {});
    writeGuestCart([]);
    setCoupon('');
    localStorage.removeItem(COUPON_KEY);
    await refresh();
  }, [isAuthenticated, refresh]);

  /** Validates the code server-side before storing it. */
  const applyCoupon = useCallback(
    async (code) => {
      const trimmed = code.trim().toUpperCase();
      const payload = isAuthenticated
        ? await api.get(`/cart?couponCode=${encodeURIComponent(trimmed)}`)
        : await api.post('/cart/quote', { items: readGuestCart(), couponCode: trimmed });

      if (payload.data.couponError) {
        setCouponError(payload.data.couponError);
        throw new Error(payload.data.couponError);
      }

      setCoupon(trimmed);
      localStorage.setItem(COUPON_KEY, trimmed);
      applyResponse(payload.data);
      toast.success(`${trimmed} applied`);
    },
    [isAuthenticated, applyResponse],
  );

  const removeCoupon = useCallback(async () => {
    setCoupon('');
    setCouponError(null);
    localStorage.removeItem(COUPON_KEY);
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      items,
      totals,
      coupon,
      couponError,
      loading,
      count: totals.itemCount ?? 0,
      maxQtyPerItem,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      add,
      setQuantity,
      remove,
      clear,
      refresh,
      applyCoupon,
      removeCoupon,
      inCart: (productId, variantId = null) =>
        items.some((i) => i.productId === productId && (i.variantId ?? null) === (variantId ?? null)),
    }),
    [items, totals, coupon, couponError, loading, drawerOpen, maxQtyPerItem, add, setQuantity, remove, clear, refresh, applyCoupon, removeCoupon],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};
