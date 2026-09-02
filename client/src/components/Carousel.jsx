import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from './Icons';
import { cx } from './ui';
import { mediaUrl } from '../api/client';

const REDUCED_MOTION = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const FADE_UP =
  'linear-gradient(to top, rgba(2,44,41,.97) 0%, rgba(2,44,41,.9) 38%, rgba(2,44,41,.5) 62%, rgba(2,44,41,.15) 85%)';

/**
 * The home page hero carousel.
 *
 * Each slide is a full-bleed photograph, anchored on the right and faded out
 * towards the left. The product's own words sit in that faded band on a wide
 * screen, or below the image on a narrow one, where a side fade
 * would leave no room to read.
 *
 * Slides are `{ image, alt, eyebrow, title, body, meta, href, ctaLabel }`.
 * Advancing pauses while the pointer or keyboard focus is inside, and stops
 * entirely for anyone who has asked for reduced motion.
 */
export default function Carousel({ slides = [], interval = 3000, className = '' }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const timer = useRef(null);
  const go = (next) => setActive((current) => (count ? (next + count) % count : 0));

  useEffect(() => {
    if (count < 2 || paused || REDUCED_MOTION()) return undefined;
    timer.current = setInterval(() => setActive((i) => (i + 1) % count), interval);
    return () => clearInterval(timer.current);
  }, [count, paused, interval]);

  // A shorter list after an edit must not leave the index pointing past the end.
  useEffect(() => {
    setActive((i) => (i < count ? i : 0));
  }, [count]);

  if (!count) return null;
  const slide = slides[active];

  return (
    <section
      className={cx('relative isolate overflow-hidden bg-brand-950', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured products"
    >
      {slides.map((item, i) => (
        <img
          key={item.image || i}
          src={mediaUrl(item.image)}
          alt={i === active ? item.alt || item.title || '' : ''}
          loading={i === 0 ? 'eager' : 'lazy'}
          aria-hidden={i !== active}
          className={cx(
            'carousel-image absolute inset-y-0 right-0 h-full w-full object-cover object-right transition-opacity duration-1000 md:left-[42%] md:w-[58%]',
            i === active ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}

      {/* Small screens need a bottom fade for readable copy. Wide screens fade
          the image itself, avoiding a colour seam where the image panel starts. */}
      <div className="absolute inset-0 md:hidden" style={{ background: FADE_UP }} aria-hidden />

      <div className="container-page relative flex min-h-[400px] items-end py-12 md:min-h-[460px] md:items-center lg:min-h-[500px]">
        <div key={active} className="max-w-xl animate-fade-up md:w-1/2">
          {slide.eyebrow && (
            <span className="badge bg-white/10 text-brand-100 ring-1 ring-white/20">{slide.eyebrow}</span>
          )}

          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
            {slide.title}
          </h1>

          {slide.body && (
            <p className="mt-5 line-clamp-4 max-w-lg text-base leading-relaxed text-brand-100/90">{slide.body}</p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-4">
            {slide.href && (
              <Link to={slide.href} className="btn bg-white px-6 py-3 text-brand-900 hover:bg-brand-50">
                {slide.ctaLabel || 'View product'} <ChevronRight width={17} height={17} />
              </Link>
            )}
            {slide.meta && <span className="text-lg font-semibold text-white">{slide.meta}</span>}
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
          <div className="absolute bottom-5 right-4 flex gap-2 sm:right-6 md:bottom-6">
            <button
              type="button"
              onClick={() => go(active - 1)}
              aria-label="Previous slide"
              className="rounded-full bg-white/10 p-2.5 text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
            >
              <ChevronLeft width={18} height={18} />
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              aria-label="Next slide"
              className="rounded-full bg-white/10 p-2.5 text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
            >
              <ChevronRight width={18} height={18} />
            </button>
          </div>

          <div className="container-page absolute inset-x-0 bottom-6 flex gap-2">
            {slides.map((item, i) => (
              <button
                key={item.image || i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === active}
                className={cx(
                  'h-1.5 rounded-full transition-all',
                  i === active ? 'w-8 bg-white' : 'w-3 bg-white/40 hover:bg-white/70',
                )}
              />
            ))}
          </div>
        </>
      )}

    </section>
  );
}
