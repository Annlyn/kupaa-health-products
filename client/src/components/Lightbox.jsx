import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CloseIcon } from './Icons';
import { cx } from './ui';
import { mediaUrl } from '../api/client';

/**
 * Full-size image viewer. Opens over the page, sizes the photo to the viewport
 * rather than the layout box it came from, and steps through the rest of the
 * set with the arrow keys or the on-screen controls.
 *
 * `images` takes the same rows the API returns — `{ url, alt }`.
 */
export default function Lightbox({ images = [], index = 0, onClose, onIndexChange, title, footer }) {
  const [current, setCurrent] = useState(index);

  useEffect(() => setCurrent(index), [index]);

  const count = images.length;
  const go = useCallback(
    (next) => {
      if (!count) return;
      const wrapped = (next + count) % count;
      setCurrent(wrapped);
      onIndexChange?.(wrapped);
    },
    [count, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowRight') go(current + 1);
      if (e.key === 'ArrowLeft') go(current - 1);
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while the overlay owns the screen.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [current, go, onClose]);

  if (!count) return null;
  const image = images[current] ?? images[0];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title || 'Image viewer'}>
      <header className="flex items-center justify-between gap-4 px-4 py-3 text-white sm:px-6">
        <div className="min-w-0">
          {title && <p className="truncate text-sm font-semibold">{title}</p>}
          {count > 1 && (
            <p className="text-xs text-white/60">
              {current + 1} of {count}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close image viewer"
          className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <CloseIcon width={20} height={20} />
        </button>
      </header>

      {/* Clicking the backdrop closes; clicking the photo itself does not. */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={onClose}>
        <img
          src={mediaUrl(image.url)}
          alt={image.alt || title || ''}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full cursor-default object-contain animate-fade-up"
        />

        {count > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(current - 1);
              }}
              aria-label="Previous image"
              className="absolute left-3 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 sm:left-6"
            >
              <ChevronLeft width={22} height={22} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(current + 1);
              }}
              aria-label="Next image"
              className="absolute right-3 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 sm:right-6"
            >
              <ChevronRight width={22} height={22} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4">
          {images.map((img, i) => (
            <button
              key={img.id ?? img.url ?? i}
              onClick={() => go(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === current}
              className={cx(
                'h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition',
                i === current ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {footer && <div className="flex justify-center px-4 pb-5">{footer}</div>}
    </div>,
    document.body,
  );
}
