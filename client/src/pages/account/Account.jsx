import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import AccountNav from './AccountNav';
import { Breadcrumbs, Field, Spinner, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { dateShort, initials } from '../../lib/format';
import { useFetch, useTitle } from '../../lib/hooks';

export default function Account() {
  useTitle('My account');
  const { user, updateProfile, logout } = useAuth();
  const { data: me } = useFetch('/auth/me');

  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (user) setProfile({ name: user.name, phone: user.phone || '' });
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ name: profile.name.trim(), phone: profile.phone.trim() });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return setPwErrors({ confirm: 'Passwords do not match' });

    setPwErrors({});
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Password changed — please sign in again');
      await logout();
    } catch (err) {
      setPwErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'My account' }]} />
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">My account</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <AccountNav />

        <div className="max-w-2xl space-y-6">
          <section className="card flex flex-wrap items-center gap-4 p-5">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 font-display text-lg font-bold text-brand-800">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-ink-950">{user?.name}</p>
              <p className="truncate text-sm text-ink-500">{user?.email}</p>
              {me?.user?.createdAt && <p className="mt-0.5 text-xs text-ink-400">Member since {dateShort(me.user.createdAt)}</p>}
            </div>
            <dl className="flex gap-6 text-center">
              <div>
                <dt className="text-xs text-ink-500">Orders</dt>
                <dd className="text-lg font-bold text-ink-950">{me?.stats?.orders ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Wishlist</dt>
                <dd className="text-lg font-bold text-ink-950">{me?.stats?.wishlist ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">Profile details</h2>
            <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input className="input" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Mobile number" hint="Used for courier delivery updates">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={10}
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '') }))}
                />
              </Field>
              <Field label="Email address" className="sm:col-span-2" hint="Contact support if you need to change your email">
                <input className="input bg-ink-50" value={user?.email || ''} disabled />
              </Field>
              <div className="sm:col-span-2">
                <button className="btn-primary" disabled={savingProfile}>
                  {savingProfile && <Spinner className="h-4 w-4" />} Save changes
                </button>
              </div>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">Change password</h2>
            <p className="mt-1 text-sm text-ink-500">Changing your password signs you out of every device.</p>

            <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Current password" error={pwErrors.currentPassword} className="sm:col-span-2">
                <input
                  type="password"
                  autoComplete="current-password"
                  className={cx('input', pwErrors.currentPassword && 'input-error')}
                  value={pw.currentPassword}
                  onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
                  required
                />
              </Field>
              <Field label="New password" error={pwErrors.newPassword} hint="Minimum 8 characters, with a letter and a number">
                <input
                  type="password"
                  autoComplete="new-password"
                  className={cx('input', pwErrors.newPassword && 'input-error')}
                  value={pw.newPassword}
                  onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Confirm new password" error={pwErrors.confirm}>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={cx('input', pwErrors.confirm && 'input-error')}
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <button className="btn-outline" disabled={savingPw}>
                  {savingPw && <Spinner className="h-4 w-4" />} Update password
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
