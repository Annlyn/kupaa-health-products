import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertIcon, ChevronLeft, ChevronRight, CloseIcon, StarIcon } from './Icons';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner className="h-8 w-8 text-brand-600" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function Rating({ value = 0, count, size = 14, className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      <span className="flex" aria-label={`Rated ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} width={size} height={size} className={n <= Math.round(value) ? 'text-amber-400' : 'text-ink-200'} />
        ))}
      </span>
      {count !== undefined && <span className="text-xs text-ink-500">({count})</span>}
    </span>
  );
}

export function EmptyState({ icon: Icon = AlertIcon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-6 py-14 text-center">
      <span className="rounded-full bg-white p-3 text-ink-400 shadow-sm">
        <Icon width={26} height={26} />
      </span>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function Badge({ children, className = '' }) {
  return <span className={cx('badge', className)}>{children}</span>;
}

export function Pagination({ page, pages, onChange, className = '' }) {
  if (!pages || pages <= 1) return null;

  // Compact window around the current page: 1 … 4 5 6 … 20
  const window = new Set([1, pages, page, page - 1, page + 1]);
  const numbers = [...window].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  return (
    <nav className={cx('flex items-center justify-center gap-1.5', className)} aria-label="Pagination">
      <button className="btn-outline btn-sm" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft width={16} height={16} />
      </button>
      {numbers.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && numbers[i - 1] !== n - 1 && <span className="px-1 text-ink-400">…</span>}
          <button
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cx(
              'h-8 min-w-8 rounded-md px-2.5 text-sm font-medium transition',
              n === page ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {n}
          </button>
        </span>
      ))}
      <button className="btn-outline btn-sm" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
        <ChevronRight width={16} height={16} />
      </button>
    </nav>
  );
}

/** Accessible modal: focus trap on open, Escape to close, click-outside to close. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lift sm:rounded-2xl animate-fade-up',
          width,
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog">
            <CloseIcon width={18} height={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = true, busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{message}</p>
    </Modal>
  );
}

export function Field({ label, error, hint, children, required, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight width={13} height={13} className="text-ink-300" />}
          {item.to ? (
            <Link to={item.to} className="hover:text-brand-700 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-ink-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square w-full" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-ink-950">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
        </div>
        {Icon && (
          <span className={cx('rounded-lg p-2.5', tones[tone])}>
            <Icon width={20} height={20} />
          </span>
        )}
      </div>
    </div>
  );
}
