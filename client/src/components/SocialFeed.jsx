import { useMemo, useState } from 'react';
import { FacebookIcon, InstagramIcon, PlayIcon, YoutubeIcon } from './Icons';
import { cx } from './ui';
import { mediaUrl } from '../api/client';
import { useStore } from '../context/StoreContext';

/**
 * The three networks the store publishes on. `settingKey` is where the profile
 * URL lives, and `tile` is the palette wash a post falls back to when no
 * thumbnail has been given — each network gets a distinct sage/charcoal blend
 * so the row stays on-brand instead of importing three vendor colour schemes.
 */
const PLATFORMS = {
  instagram: {
    label: 'Instagram',
    icon: InstagramIcon,
    settingKey: 'socialInstagramUrl',
    chip: 'bg-brand-50 text-brand-700',
    tile: 'from-brand-400 via-brand-600 to-kupaa-charcoal',
  },
  youtube: {
    label: 'YouTube',
    icon: YoutubeIcon,
    settingKey: 'socialYoutubeUrl',
    chip: 'bg-ink-100 text-ink-700',
    tile: 'from-kupaa-black via-kupaa-charcoal to-brand-800',
  },
  facebook: {
    label: 'Facebook',
    icon: FacebookIcon,
    settingKey: 'socialFacebookUrl',
    chip: 'bg-brand-100 text-brand-800',
    tile: 'from-brand-800 via-brand-600 to-brand-300',
  },
};

const ORDER = Object.keys(PLATFORMS);

/** Admin types the platform by hand, so accept any casing or stray spaces. */
const normalise = (value) => String(value || '').trim().toLowerCase();

function PostCard({ post }) {
  const platform = PLATFORMS[post.platform];
  const Icon = platform.icon;
  const isVideo = post.platform === 'youtube';

  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden bg-ink-50">
        {post.image ? (
          <img
            src={mediaUrl(post.image)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={cx('grid h-full w-full place-items-center bg-gradient-to-br text-white/90', platform.tile)}>
            <Icon width={44} height={44} />
          </div>
        )}

        <span className="absolute left-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink-800 shadow-sm backdrop-blur">
          <Icon width={16} height={16} />
        </span>

        {isVideo && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/85 text-brand-900 shadow-lift transition group-hover:scale-110">
              <PlayIcon width={22} height={22} className="translate-x-px" />
            </span>
          </span>
        )}
      </div>

      <div className="p-4">
        <span className={cx('badge', platform.chip)}>{platform.label}</span>
        {post.caption && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-600">{post.caption}</p>}
        <p className="mt-2 text-xs font-semibold text-brand-700 group-hover:underline">
          {isVideo ? 'Watch on' : 'View on'} {platform.label} →
        </p>
      </div>
    </a>
  );
}

/** Follow button for one network. */
function FollowLink({ platform, href }) {
  const Icon = platform.icon;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm gap-1.5">
      <Icon width={15} height={15} /> {platform.label}
    </a>
  );
}

/**
 * Posts the store has chosen to feature across Instagram, YouTube and Facebook.
 *
 * The list is curated under Admin → Store settings → Social feed rather than
 * pulled live: the Instagram and Facebook Graph APIs need a reviewed app and a
 * long-lived token per account, and an expired token would silently empty the
 * section. Each entry is a platform, a link, an optional thumbnail and a
 * caption; a post with no thumbnail falls back to that network's wash.
 */
export default function SocialFeed() {
  const settings = useStore();
  const [filter, setFilter] = useState('all');

  const posts = useMemo(
    () =>
      (settings.socialPosts ?? [])
        .map((post) => ({ ...post, platform: normalise(post?.platform) }))
        .filter((post) => PLATFORMS[post.platform] && post.url),
    [settings.socialPosts],
  );

  const follows = ORDER.map((key) => ({ key, platform: PLATFORMS[key], href: settings[PLATFORMS[key].settingKey] })).filter(
    (entry) => entry.href,
  );

  if (!settings.socialEnabled || (!posts.length && !follows.length)) return null;

  // Only worth a filter row when there is more than one network to choose from.
  const present = ORDER.filter((key) => posts.some((post) => post.platform === key));
  const tabs = present.length > 1 ? ['all', ...present] : [];
  const visible = filter === 'all' ? posts : posts.filter((post) => post.platform === filter);

  return (
    <section id="social" className="scroll-mt-28 py-14">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">{settings.socialTitle}</h2>
            {settings.socialSubtitle && <p className="mt-1.5 text-sm text-ink-500">{settings.socialSubtitle}</p>}
          </div>

          {follows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden text-sm text-ink-500 sm:inline">Follow us</span>
              {follows.map((entry) => (
                <FollowLink key={entry.key} platform={entry.platform} href={entry.href} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
