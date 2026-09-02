import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api, getAccessToken, hadSession, setAccessToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore the session on first paint. A persisted access token may have
  // expired while the browser was closed, so fall back to the long-lived
  // refresh cookie before treating the visitor as signed out.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // First-time visitors have no refresh cookie — skip the call entirely
        // rather than firing a request that can only 401.
        if (!getAccessToken() && hadSession()) await api.refreshSession();
        if (getAccessToken()) {
          let response;
          try {
            response = await api.get('/auth/me');
          } catch {
            // /auth/me deliberately does not auto-retry in the API client.
            // Renew here when its bearer token has elapsed, then retry once.
            const refreshed = await api.refreshSession();
            if (!refreshed) throw new Error('Session expired');
            response = await api.get('/auth/me');
          }
          if (!cancelled) setUser(response.data.user);
        }
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  /**
   * Sign-in is three steps: say who you are, prove you hold that email or
   * number, then the password. Step two is skipped on a browser that has
   * verified this account before — the server decides, and says so in `step`.
   */
  const loginStart = useCallback(async (identifier) => {
    const { data } = await api.post('/auth/login/start', { identifier });
    return data;
  }, []);

  const loginResend = useCallback(async (challengeId) => {
    const { data } = await api.post('/auth/login/resend', { challengeId });
    return data;
  }, []);

  const loginVerify = useCallback(async ({ challengeId, code }) => {
    const { data } = await api.post('/auth/login/verify', { challengeId, code });
    return data;
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
    toast.success('Signed out');
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { data } = await api.patch('/auth/me', payload);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'ADMIN',
      loginStart,
      loginResend,
      loginVerify,
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, booting, loginStart, loginResend, loginVerify, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
