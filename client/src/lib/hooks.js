import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * GET a path into { data, meta, loading, error, reload }.
 *
 * The request only fires when `path` is truthy and `enabled` is not false, so
 * a component can mount without hitting the network and start fetching later.
 */
export function useFetch(path, deps = [], { enabled = true } = {}) {
  const active = Boolean(path) && enabled;
  const [state, setState] = useState({ data: null, meta: null, loading: active, error: null });
  const latest = useRef(0);

  const load = useCallback(
    async ({ fresh = false } = {}) => {
      if (!active) return;

      const ticket = ++latest.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const payload = await api.get(path, fresh ? { fresh: true } : undefined);
        // Ignore responses from superseded requests (fast filter typing).
        if (ticket === latest.current) setState({ data: payload.data, meta: payload.meta ?? null, loading: false, error: null });
      } catch (err) {
        if (ticket === latest.current) setState({ data: null, meta: null, loading: false, error: err });
      }
    },
    [path, active],
  );

  useEffect(() => {
    if (!active) {
      setState({ data: null, meta: null, loading: false, error: null });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, active, ...deps]);

  return {
    ...state,
    reload: () => load({ fresh: true }),
    setData: (data) => setState((s) => ({ ...s, data })),
  };
}

/**
 * Same as useFetch, but holds off until the returned ref scrolls near the
 * viewport. Below-the-fold sections cost nothing on first paint.
 *
 *   const { ref, data } = useFetchOnVisible('/products?limit=8');
 *   <section ref={ref}>…</section>
 */
export function useFetchOnVisible(path, deps = [], { rootMargin = '300px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;

    const node = ref.current;
    // Without IntersectionObserver (older browsers, jsdom) just load normally.
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return { ref, visible, ...useFetch(path, deps, { enabled: visible }) };
}

/** Debounces a rapidly changing value (search boxes, filters). */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Sets document.title, restoring the previous one on unmount. */
export function useTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Kupaa Health Products` : 'Kupaa Health Products';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Tracks an async action's pending state so buttons can disable themselves. */
export function useAction(fn) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args) => {
      setBusy(true);
      try {
        return await fn(...args);
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return [run, busy];
}
