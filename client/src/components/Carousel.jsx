import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from './Icons';
import { cx } from './ui';
import { mediaUrl } from '../api/client';

const REDUCED_MOTION = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The home page hero carousel.
 *
 * On a wide screen each slide is a full-bleed photograph anchored on the right
 * and faded out towards the left, with the product's own words in that faded
 * band. A narrow screen stacks instead: the photograph holds the top, fades
 * from the middle down into the brand green, and only the product's name sits
 * in that settled band at the bottom — tapping the slide opens the product,
 * so there is no need for the supporting copy or a separate button.
 *
 * Slides are `{ image, alt, eyebrow, title, body, meta, href, ctaLabel }`.
 * Advancing pauses while the pointer or keyboard focus is inside, and stops
 * entirely for anyone who has asked for reduced motion.
 */
export default function Carousel({ slides = [], interval = 2000, className = '' }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const timer = useRef(null);
  const touchStartX = useRef(null);
  const swiped = useRef(false);
  const navigate = useNavigate();
  const go = (next) => setActive((current) => (count ? (next + count) % count : 0));

  // A mouse has room for the full slide and a button, so a click just advances.
  // A touch has neither: the tap is the only affordance, so it opens the product.
  const handleCarouselClick = (event) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (event.target.closest('button, a')) return;
    if (window.matchMedia?.('(pointer: fine)').matches) {
      go(active + 1);
      return;
    }
    const href = slides[active]?.href;
    if (href) navigate(href);
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current == null) return;
    const distance = event.changedTouches[0]?.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 40) return;
    swiped.current = true;
    go(active + (distance < 0 ? 1 : -1));
  };

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
      onClick={handleCarouselClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: slide.href ? 'pointer' : undefined }}
    >
      {slides.map((item, i) => (
        <img
          key={item.image || i}
          src={mediaUrl(item.image)}
          alt={i === active ? item.alt || item.title || '' : ''}
          loading={i === 0 ? 'eager' : 'lazy'}
          aria-hidden={i !== active}
          className={cx(
            'carousel-image absolute inset-y-0 right-0 h-full w-full object-cover object-top transition-opacity duration-1000 md:left-[42%] md:w-[58%] md:object-right',
            i === active ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}

      <div className="container-page relative flex min-h-[440px] items-end pb-16 pt-12 md:min-h-[460px] md:items-center md:py-12 lg:min-h-[500px]">
        <div key={active} className="max-w-xl animate-fade-up md:w-1/2">
          {slide.eyebrow && (
            <span className="badge hidden bg-white/10 text-brand-100 ring-1 ring-white/20 md:inline-flex">
              {slide.eyebrow}
            </span>
          )}

          <h1 className="font-display text-4xl font-bold leading-[1.1] text-white sm:text-5xl md:mt-5 lg:text-6xl">
            {slide.href ? (
              <Link to={slide.href} className="rounded-md">
                {slide.title}
              </Link>
            ) : (
              slide.title
            )}
          </h1>

          {slide.body && (
            <p className="mt-5 line-clamp-4 hidden max-w-lg text-base leading-relaxed text-brand-100/90 md:block">
              {slide.body}
            </p>
          )}

          <div className="mt-7 hidden flex-wrap items-center gap-4 md:flex">
            {slide.href && (
              <Link to={slide.href} className="btn bg-white px-6 py-3 text-brand-900 hover:bg-brand-50">
                {slide.ctaLabel || 'View product'} <ChevronRight width={17} height={17} />
              </Link>
            )}
            {/* {slide.meta && <span className="text-lg font-semibold text-white">{slide.meta}</span>} */}
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
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
