import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api, getAccessToken, hadSession, setAccessToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore the session on first paint: try the stored access token, then the
  // refresh cookie. Either path lands us on /auth/me.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // First-time visitors have no refresh cookie — skip the call entirely
        // rather than firing a request that can only 401.
        if (!getAccessToken() && hadSession()) await api.refreshSession();
        if (getAccessToken()) {
          const { data } = await api.get('/auth/me');
          if (!cancelled) setUser(data.user);
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
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, booting, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
