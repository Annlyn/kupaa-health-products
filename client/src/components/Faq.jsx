import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, HelpIcon, MailIcon, PhoneIcon } from './Icons';
import { cx } from './ui';
import { useStore } from '../context/StoreContext';

/** One question. Open state is owned by the section so only one is expanded. */
function FaqRow({ id, question, answer, open, onToggle }) {
  return (
    <div className={cx('overflow-hidden rounded-xl border transition', open ? 'border-brand-200 bg-brand-50/40' : 'border-ink-100 bg-white')}>
      <h3>
        <button
          type="button"
          id={`${id}-label`}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
        >
          <span className={cx('text-sm font-semibold sm:text-base', open ? 'text-brand-900' : 'text-ink-900')}>{question}</span>
          <ChevronDown
            width={18}
            height={18}
            className={cx('shrink-0 transition-transform duration-200', open ? 'rotate-180 text-brand-700' : 'text-ink-400')}
          />
        </button>
      </h3>

      {/* Kept mounted so the answer stays findable with the browser's own search. */}
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-label`}
        hidden={!open}
        className="px-4 pb-4 text-sm leading-relaxed text-ink-600 sm:px-5"
      >
        {answer}
      </div>
    </div>
  );
}

/**
 * The home page FAQ.
 *
 * Questions come from Admin → Store settings → FAQ section, so the copy is
 * editable without a deploy. The same list is emitted as FAQPage structured
 * data, which is what search engines expand under the store's result.
 */
export default function Faq() {
  const settings = useStore();
  const [open, setOpen] = useState(0);

  const items = useMemo(
    () => (settings.faqItems ?? []).filter((item) => item?.question && item?.answer),
    [settings.faqItems],
  );

  if (!settings.faqEnabled || !items.length) return null;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <section id="faq" className="scroll-mt-28 border-t border-ink-100 bg-ink-50/60 py-14">
      <div className="container-page grid gap-8 lg:grid-cols-[320px_1fr] lg:gap-12">
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <span className="badge bg-brand-100 text-brand-800">
            <HelpIcon width={14} height={14} /> Good to know
          </span>
          <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{settings.faqTitle}</h2>
          {settings.faqSubtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{settings.faqSubtitle}</p>}
        </div>

        <div className="space-y-2.5">
          {items.map((item, i) => (
            <FaqRow
              key={item.question}
              id={`faq-answer-${i}`}
              question={item.question}
              answer={item.answer}
              open={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </section>
  );
}
