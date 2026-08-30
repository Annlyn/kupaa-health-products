import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { LeafIcon, ShieldIcon } from '../components/Icons';
import { Field, PageLoader, Spinner, cx } from '../components/ui';
import { useTitle } from '../lib/hooks';

export default function Login() {
  useTitle('Sign in');
  const { login, isAuthenticated, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (booting) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const user = await login({ email: form.email.trim(), password: form.password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(location.state?.from || (user.role === 'ADMIN' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="container-page grid min-h-[70vh] items-center gap-12 py-12 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-md">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 text-white">
          <LeafIcon width={22} height={22} />
        </span>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-500">Sign in to see your orders, wishlist and saved addresses.</p>

        <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
          <Field label="Email address" error={errors.email} required>
            <input
              type="email"
              autoComplete="email"
              className={cx('input', errors.email && 'input-error')}
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              required
            />
          </Field>

          <Field label="Password" error={errors.password} required>
            <input
              type="password"
              autoComplete="current-password"
              className={cx('input', errors.password && 'input-error')}
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              required
            />
          </Field>

          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Sign in
          </button>
        </form>

        <p className="mt-5 text-sm text-ink-600">
          New to Kupaa?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>

        {/*
          Credentials are never printed in the UI — not even for the demo data,
          and never in a production build. See the README for the seeded logins.
        */}
        {import.meta.env.DEV && (
          <p className="mt-7 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-xs text-ink-500">
            Development build. The seeded demo logins are listed in the project README under{' '}
            <span className="font-medium text-ink-700">Quick start</span>.
          </p>
        )}
      </div>

      <div className="hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-10 lg:block">
        <blockquote className="text-lg leading-relaxed text-brand-50">
          “I switched to Kupaa because the labels actually tell you the dose. Six months in, my vitamin D is finally in range.”
        </blockquote>
        <p className="mt-5 text-sm font-semibold text-brand-200">Meera S. — Bengaluru</p>

        <ul className="mt-10 space-y-3 border-t border-white/15 pt-6 text-sm text-brand-100">
          {['Third-party tested every batch', 'Order tracking end to end', 'Free delivery above ₹999'].map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <ShieldIcon width={16} height={16} className="text-brand-300" /> {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
