import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, LeafIcon } from '../components/Icons';
import { Field, PageLoader, Spinner, cx } from '../components/ui';
import { useTitle } from '../lib/hooks';

const RULES = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'Contains a letter', test: (v) => /[a-zA-Z]/.test(v) },
  { label: 'Contains a number', test: (v) => /[0-9]/.test(v) },
];

export default function Register() {
  useTitle('Create your account');
  const { register, isAuthenticated, booting } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => RULES.filter((r) => r.test(form.password)).length, [form.password]);

  if (booting) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone.trim())) next.phone = 'Enter a valid 10-digit mobile number';
    if (strength < RULES.length) next.password = 'Password does not meet the requirements below';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      toast.success(`Welcome to Kupaa, ${user.name.split(' ')[0]}`);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 text-white">
          <LeafIcon width={22} height={22} />
        </span>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Create your account</h1>
        <p className="mt-1.5 text-sm text-ink-500">Faster checkout, order tracking and a saved wishlist.</p>

        <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
          <Field label="Full name" error={errors.name} required>
            <input className={cx('input', errors.name && 'input-error')} autoComplete="name" value={form.name} onChange={set('name')} />
          </Field>

          <Field label="Email address" error={errors.email} required>
            <input
              type="email"
              autoComplete="email"
              className={cx('input', errors.email && 'input-error')}
              value={form.email}
              onChange={set('email')}
            />
          </Field>

          <Field label="Mobile number" error={errors.phone} hint="Used for delivery updates from the courier">
            <input
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel"
              className={cx('input', errors.phone && 'input-error')}
              value={form.phone}
              onChange={(e) => {
                setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }));
                setErrors((p) => ({ ...p, phone: undefined }));
              }}
            />
          </Field>

          <Field label="Password" error={errors.password} required>
            <input
              type="password"
              autoComplete="new-password"
              className={cx('input', errors.password && 'input-error')}
              value={form.password}
              onChange={set('password')}
            />
            {form.password && (
              <ul className="mt-2 space-y-1">
                {RULES.map((rule) => {
                  const ok = rule.test(form.password);
                  return (
                    <li key={rule.label} className={cx('flex items-center gap-1.5 text-xs', ok ? 'text-brand-600' : 'text-ink-400')}>
                      <CheckCircle width={13} height={13} /> {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </Field>

          <Field label="Confirm password" error={errors.confirm} required>
            <input
              type="password"
              autoComplete="new-password"
              className={cx('input', errors.confirm && 'input-error')}
              value={form.confirm}
              onChange={set('confirm')}
            />
          </Field>

          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Create account
          </button>

          <p className="text-center text-xs text-ink-400">
            By creating an account you agree to our{' '}
            <Link to="/policies#terms" className="underline hover:text-ink-700">
              terms
            </Link>{' '}
            and{' '}
            <Link to="/policies#privacy" className="underline hover:text-ink-700">
              privacy policy
            </Link>
            .
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
