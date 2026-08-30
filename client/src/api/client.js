/**
 * Thin fetch wrapper around the Kupaa API.
 *
 * The access token lives in memory (plus a localStorage mirror so a refresh
 * does not sign you out instantly); the refresh token is an httpOnly cookie the
 * browser sends automatically to /api/auth. On a 401 we transparently refresh
 * once and replay the original request — concurrent 401s share one refresh.
 */

/**
 * Same-origin by default (the dev proxy, or the API serving the built SPA).
 * Set VITE_API_URL when the frontend is hosted separately — GitHub Pages, a CDN —
 * e.g. VITE_API_URL=https://kupaa-api.onrender.com
 */
const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api`;

/** True when the API is on another origin, so its cookies are third-party. */
export const isCrossOrigin = Boolean(API_ORIGIN);

/**
 * Product images are stored as server-relative paths ("/uploads/x.png"). Hosted
 * separately they must resolve against the API origin, or the browser looks for
 * them on the static host and 404s.
 */
export const mediaUrl = (url) => {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const TOKEN_KEY = 'kupaa_token';
const SESSION_KEY = 'kupaa_session';

let accessToken = localStorage.getItem(TOKEN_KEY) || null;
let onUnauthorized = null;
let refreshing = null;

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, '1');
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
};

export const getAccessToken = () => accessToken;

/**
 * True when this browser has signed in before, so the refresh cookie is worth
 * trying. Without it every first-time visitor would fire a guaranteed-401
 * refresh call on page load.
 */
export const hadSession = () => localStorage.getItem(SESSION_KEY) === '1';
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  /** Field-keyed messages for form rendering. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

async function refreshSession() {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      const body = await res.json();
      setAccessToken(body.data.accessToken);
      return body.data;
    } catch {
      return null;
    } finally {
      // Release the shared promise on the next tick so followers see the result.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

async function request(path, { method = 'GET', body, headers = {}, raw = false, retry = true, signal } = {}) {
  const isForm = body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      ...(isForm ? {} : body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return request(path, { method, body, headers, raw, retry: false, signal });
    setAccessToken(null);
    onUnauthorized?.();
  }

  if (raw) return res;

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false) {
    throw new ApiError(payload?.error?.message || `Request failed (${res.status})`, res.status, payload?.error?.details);
  }
  return payload;
}

/**
 * GET de-duplication and caching.
 *
 * Two components asking for the same path at the same time share one request.
 * Paths listed in CACHE_TTL additionally keep their result for a short window,
 * so navigating back to a page does not re-fetch data that rarely changes.
 * Any write invalidates the whole cache — these are cheap reads, and stale
 * catalogue data after an admin edit would be far more confusing.
 */
const inflight = new Map();
const cache = new Map();

const CACHE_TTL = [
  [/^\/store$/, 5 * 60_000],
  [/^\/categories/, 2 * 60_000],
  [/^\/products\/facets/, 2 * 60_000],
  [/^\/payments\/config/, 5 * 60_000],
];

const ttlFor = (path) => CACHE_TTL.find(([pattern]) => pattern.test(path))?.[1] ?? 0;

export const invalidateCache = (prefix) => {
  if (!prefix) return void cache.clear();
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
};

function cachedGet(path, opts = {}) {
  // An aborted or explicitly fresh request bypasses both layers.
  if (opts.signal || opts.fresh) return request(path, { ...opts, method: 'GET' });

  const ttl = ttlFor(path);
  const hit = cache.get(path);
  if (ttl && hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.payload);

  const pending = inflight.get(path);
  if (pending) return pending;

  const promise = request(path, { ...opts, method: 'GET' })
    .then((payload) => {
      if (ttl) cache.set(path, { payload, at: Date.now() });
      return payload;
    })
    .finally(() => inflight.delete(path));

  inflight.set(path, promise);
  return promise;
}

// POSTs that only read (they take a body but change nothing) must not bust the cache.
const READ_ONLY_POSTS = [/^\/cart\/quote/];

const write = (method) => (path, body, opts) =>
  request(path, { ...opts, method, body }).then((payload) => {
    if (!READ_ONLY_POSTS.some((pattern) => pattern.test(path))) invalidateCache();
    return payload;
  });

export const api = {
  get: cachedGet,
  post: write('POST'),
  put: write('PUT'),
  patch: write('PATCH'),
  del: write('DELETE'),
  raw: (path, opts) => request(path, { ...opts, raw: true }),
  refreshSession,
};

/** Builds `?a=1&b=2`, dropping empty values. */
export const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    search.set(k, String(v));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};
