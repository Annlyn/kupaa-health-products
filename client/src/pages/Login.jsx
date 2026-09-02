import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, LeafIcon, ShieldIcon } from '../components/Icons';
import { Field, PageLoader, Spinner, cx } from '../components/ui';
import { useTitle } from '../lib/hooks';
import { DEMO, demoAccounts } from 'virtual:demo';

const RESEND_SECONDS = 30;

export default function Login() {
  useTitle('Sign in');
  const { loginStart, loginResend, loginVerify, login, isAuthenticated, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // IDENTIFIER → OTP → PASSWORD. The server decides whether OTP is needed, so
  // a browser that has verified before goes straight from the first step to
  // the last.
  const [step, setStep] = useState('IDENTIFIER');
  const [form, setForm] = useState({ identifier: '', code: '', password: '' });
  const [challenge, setChallenge] = useState(null);
  const [verificationToken, setVerificationToken] = useState(null);
  const [trusted, setTrusted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);

  // "Send another code" stays disabled briefly, so a stuck message does not
  // turn into a burst of them.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'OTP') codeRef.current?.focus();
  }, [step]);

  // Only ever non-empty in a demo build; the snapshot loads asynchronously.
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    if (!DEMO) return;
    demoAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  if (booting) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/'} replace />;

  const applyStep = (data) => {
    if (data.step === 'PASSWORD') {
      setTrusted(data.verification === 'trusted-device');
      setStep('PASSWORD');
      return;
    }
    setChallenge(data);
    setCooldown(RESEND_SECONDS);
    setStep('OTP');
  };

  const guard = async (run) => {
    setErrors({});
    setBusy(true);
    try {
      await run();
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitIdentifier = (e) => {
    e.preventDefault();
    return guard(async () => applyStep(await loginStart(form.identifier.trim())));
  };

  const submitCode = (e) => {
    e.preventDefault();
    return guard(async () => {
      const data = await loginVerify({ challengeId: challenge.challengeId, code: form.code.trim() });
      setVerificationToken(data.verificationToken);
      setStep('PASSWORD');
      toast.success('Verified — one more step');
    });
  };

  const resend = () =>
    guard(async () => {
      const data = await loginResend(challenge.challengeId);
      setChallenge(data);
      setCooldown(RESEND_SECONDS);
      setForm((f) => ({ ...f, code: '' }));
      toast.success('New code sent');
    });

  const submitPassword = (e) => {
    e.preventDefault();
    return guard(async () => {
      const user = await login({
        identifier: form.identifier.trim(),
        password: form.password,
        verificationToken: verificationToken ?? undefined,
      });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(location.state?.from || (user.role === 'ADMIN' ? '/admin' : '/'), { replace: true });
    });
  };

  const restart = () => {
    setStep('IDENTIFIER');
    setChallenge(null);
    setVerificationToken(null);
    setTrusted(false);
    setForm({ identifier: form.identifier, code: '', password: '' });
    setErrors({});
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="container-page grid min-h-[70vh] items-center gap-12 py-12 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-md">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 text-white">
          <LeafIcon width={22} height={22} />
        </span>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {step === 'IDENTIFIER' && 'Sign in to see your orders, wishlist and saved addresses.'}
          {step === 'OTP' && `Enter the code we sent to ${challenge?.destination || 'you'}.`}
          {step === 'PASSWORD' &&
            (trusted ? 'This device is already verified — just your password.' : 'Verified. Now your password.')}
        </p>

        {step === 'IDENTIFIER' && (
          <form onSubmit={submitIdentifier} className="mt-7 space-y-4" noValidate>
            <Field
              label="Email or mobile number"
              error={errors.identifier || errors.email}
              hint="We send a one-time code to confirm it is you"
              required
            >
              <input
                type="text"
                autoComplete="username"
                autoFocus
                className={cx('input', (errors.identifier || errors.email) && 'input-error')}
                value={form.identifier}
                onChange={set('identifier')}
                placeholder="you@example.com or 9876543210"
                required
              />
            </Field>

            <button className="btn-primary w-full py-3" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Continue
            </button>
          </form>
        )}

        {step === 'OTP' && (
          <form onSubmit={submitCode} className="mt-7 space-y-4" noValidate>
            <Field
              label="Verification code"
              error={errors.code}
              hint={challenge?.channel === 'EMAIL' ? 'Sent by email' : 'Sent on WhatsApp'}
              required
            >
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className={cx('input text-center text-2xl tracking-[0.5em]', errors.code && 'input-error')}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                placeholder="······"
                required
              />
            </Field>

            <button className="btn-primary w-full py-3" disabled={busy || form.code.length < 4}>
              {busy && <Spinner className="h-4 w-4" />} Verify
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button type="button" onClick={restart} className="font-medium text-ink-500 hover:text-ink-800">
                ← Use a different one
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={busy || cooldown > 0}
                className="font-semibold text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline"
              >
                {cooldown > 0 ? `Send another code in ${cooldown}s` : 'Send another code'}
              </button>
            </div>

            {/* Development only, and only ever for an account that exists: the
                API returns the code outside production so a local sign-in does
                not need the server log open. */}
            {import.meta.env.DEV && challenge?.devCode && (
              <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-500">
                Development build — the code is{' '}
                <code className="font-mono font-semibold text-ink-800">{challenge.devCode}</code>. Configure WhatsApp or
                SMTP to have it delivered.
              </p>
            )}
          </form>
        )}

        {step === 'PASSWORD' && (
          <form onSubmit={submitPassword} className="mt-7 space-y-4" noValidate>
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
              <CheckCircle width={16} height={16} className="shrink-0" />
              <span className="truncate">{form.identifier}</span>
              <button type="button" onClick={restart} className="ml-auto shrink-0 text-xs font-semibold hover:underline">
                Change
              </button>
            </div>

            <Field label="Password" error={errors.password} required>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
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

            <p className="hint">You will stay signed in on this device, and it will not ask for a code again.</p>
          </form>
        )}

        <p className="mt-5 text-sm text-ink-600">
          New to Kupaa?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>

        {/*
          Credentials are never printed in the UI — not even for the seeded data,
          and never against a real API. The one exception is a demo build, where
          the accounts exist only in the bundled snapshot, unlock nothing, and
          are already readable in the JavaScript. See demo/README.md.
        */}
        {DEMO && accounts.length > 0 && (
          <div className="mt-7 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-xs text-ink-600">
            <p className="font-semibold text-ink-700">Demo logins</p>
            <p className="mt-1">This build has no server. Nothing you do here is saved.</p>
            <ul className="mt-2.5 space-y-1">
              {accounts.map((account) => (
                <li key={account.email} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-16 shrink-0 text-ink-500">{account.label}</span>
                  <code className="font-medium text-ink-800">{account.email}</code>
                  <code className="text-ink-500">{account.password}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!DEMO && import.meta.env.DEV && (
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
          {['Third-party tested every batch', 'Order tracking end to end', 'Clear pricing at checkout'].map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <ShieldIcon width={16} height={16} className="text-brand-300" /> {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
