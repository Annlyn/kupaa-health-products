import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { CloseIcon, PlusIcon, RefreshIcon } from '../../components/Icons';
import { Badge, ConfirmDialog, Field, PageLoader, Spinner, cx } from '../../components/ui';
import { useStoreContext } from '../../context/StoreContext';
import { useFetch, useTitle } from '../../lib/hooks';

/** Repeatable list of small objects — hero stats, trust items, promo bullets. */
function ListEditor({ field, value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const blank = Object.fromEntries(field.fields.map((f) => [f.key, '']));

  const setRow = (index, key, next) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: next } : row)));

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-start gap-2 rounded-lg border border-ink-100 bg-ink-50/40 p-2.5">
          <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-ink-400">{index + 1}</span>
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            {field.fields.map((sub) => (
              <label key={sub.key} className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">{sub.label}</span>
                <input
                  className="input py-2 text-sm"
                  value={row[sub.key] ?? ''}
                  maxLength={sub.max ?? 200}
                  onChange={(e) => setRow(index, sub.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="mt-1 rounded p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove entry ${index + 1}`}
          >
            <CloseIcon width={15} height={15} />
          </button>
        </div>
      ))}

      {(!field.max || rows.length < field.max) && (
        <button type="button" className="btn-outline btn-sm" onClick={() => onChange([...rows, blank])}>
          <PlusIcon width={14} height={14} /> Add entry
        </button>
      )}
      {field.max && <p className="hint">Up to {field.max} entries.</p>}
    </div>
  );
}

function SettingInput({ field, value, onChange }) {
  switch (field.type) {
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-100 px-3.5 py-3 text-sm text-ink-700 hover:bg-ink-50">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );

    case 'number':
      return (
        <input
          type="number"
          className="input"
          value={value ?? 0}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step="0.01"
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );

    case 'text':
      return (
        <textarea
          className="input min-h-32"
          value={value ?? ''}
          maxLength={field.max ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'list':
      return <ListEditor field={field} value={value} onChange={onChange} />;

    default:
      return <input className="input" value={value ?? ''} maxLength={field.max ?? undefined} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default function AdminSettings() {
  useTitle('Store settings · Admin');
  const { data, loading, reload } = useFetch('/admin/settings');
  const { reload: reloadStorefront } = useStoreContext();

  const [draft, setDraft] = useState({});
  const [activeGroup, setActiveGroup] = useState('identity');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (data?.values) setDraft(data.values);
  }, [data]);

  const fieldsByKey = useMemo(
    () => Object.fromEntries((data?.fields ?? []).map((f) => [f.key, f])),
    [data],
  );

  // Only send what actually changed, so untouched settings keep using defaults.
  const changedKeys = useMemo(() => {
    if (!data?.values) return [];
    return Object.keys(draft).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(data.values[key]));
  }, [draft, data]);

  if (loading || !data) return <PageLoader label="Loading store settings" />;

  const save = async () => {
    if (!changedKeys.length) return toast('Nothing has changed yet', { icon: 'ℹ️' });

    setSaving(true);
    try {
      await api.put('/admin/settings', Object.fromEntries(changedKeys.map((k) => [k, draft[k]])));
      toast.success('Storefront updated');
      await Promise.all([reload(), reloadStorefront()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetGroup = async () => {
    setResetting(true);
    try {
      const keys = data.groups.find((g) => g.key === activeGroup)?.keys ?? [];
      await api.post('/admin/settings/reset', { keys });
      toast.success('Section reset to defaults');
      setConfirmReset(false);
      await Promise.all([reload(), reloadStorefront()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  const group = data.groups.find((g) => g.key === activeGroup) ?? data.groups[0];
  const customisedInGroup = group.keys.filter((k) => fieldsByKey[k]?.isCustomised).length;

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Store settings</h1>
          <p className="mt-1 text-sm text-ink-500">
            Everything customers read on the storefront, plus the pricing and delivery rules used at checkout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changedKeys.length > 0 && <Badge className="bg-amber-50 text-amber-700">{changedKeys.length} unsaved</Badge>}
          <button className="btn-outline" onClick={() => setDraft(data.values)} disabled={!changedKeys.length || saving}>
            Discard
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !changedKeys.length}>
            {saving && <Spinner className="h-4 w-4" />} Save changes
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Setting sections" className="lg:sticky lg:top-6 lg:h-fit">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {data.groups.map((g) => {
              const dirty = g.keys.some((k) => changedKeys.includes(k));
              return (
                <li key={g.key}>
                  <button
                    onClick={() => setActiveGroup(g.key)}
                    className={cx(
                      'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition',
                      activeGroup === g.key ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100',
                    )}
                  >
                    {g.label}
                    {dirty && <span className={cx('h-1.5 w-1.5 rounded-full', activeGroup === g.key ? 'bg-white' : 'bg-amber-500')} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold">{group.label}</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                {customisedInGroup > 0
                  ? `${customisedInGroup} of ${group.keys.length} customised — the rest use the defaults from .env`
                  : 'All values are the built-in defaults'}
              </p>
            </div>
            <button className="btn-outline btn-sm" onClick={() => setConfirmReset(true)} disabled={customisedInGroup === 0}>
              <RefreshIcon width={14} height={14} /> Reset section
            </button>
          </div>

          <div className="mt-5 grid gap-5">
            {group.keys.map((key) => {
              const field = fieldsByKey[key];
              if (!field) return null;
              const isWide = field.type === 'text' || field.type === 'list';
              const dirty = changedKeys.includes(key);

              return (
                <div key={key} className={cx(isWide ? '' : 'max-w-md', dirty && 'rounded-lg ring-2 ring-amber-200 ring-offset-4')}>
                  {field.type === 'boolean' ? (
                    <>
                      <SettingInput field={field} value={draft[key]} onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))} />
                      {field.hint && <p className="hint">{field.hint}</p>}
                    </>
                  ) : (
                    <Field label={field.label} hint={field.hint}>
                      <SettingInput field={field} value={draft[key]} onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))} />
                    </Field>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetGroup}
        busy={resetting}
        danger={false}
        title={`Reset “${group.label}” to defaults?`}
        message="Your customisations for this section are removed and the built-in values apply again. Other sections are untouched."
        confirmLabel="Reset section"
      />
    </div>
  );
}
