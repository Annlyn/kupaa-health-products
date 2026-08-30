/**
 * Loads the real built bundle from the Pages-style static host and lets it talk
 * to the API on another origin — the exact production shape.
 */
import pkg from 'jsdom';
const { JSDOM } = pkg;

const PAGE = 'http://localhost:5180/kupaa-health-products/';
const API = 'http://localhost:4000';

const errors = [];
const calls = [];
const dom = await JSDOM.fromURL(PAGE, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.scrollTo = () => true;
    class O { observe() {} unobserve() {} disconnect() {} }
    window.ResizeObserver = O;
    class I { constructor(cb) { this.cb = cb; } observe(n) { setTimeout(() => this.cb([{ target: n, isIntersecting: true }]), 0); } unobserve() {} disconnect() {} }
    window.IntersectionObserver = I;
    window.console.error = (...a) => errors.push(a.join(' '));
    // jsdom has no fetch; hand the page Node's, which respects no CORS —
    // CORS itself was verified separately with a real preflight.
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      return fetch(url, init);
    };
  },
});

await new Promise((r) => setTimeout(r, 3500));
const { window } = dom;
const html = window.document.body.innerHTML;
const text = window.document.body.textContent.replace(/\s+/g, ' ');

let failures = 0;
const ok = (l, p, d = '') => { console.log(`${p ? '✓' : '✗'} ${l.padEnd(46)} ${d}`); if (!p) failures += 1; };

ok('bundle executed and mounted', html.length > 2000, `${html.length} bytes rendered`);
ok('calls the cross-origin API', calls.some((c) => c.startsWith(`${API}/api/`)), calls.find((c) => c.startsWith(API))?.slice(0, 60) ?? 'none');
ok('no same-origin /api calls leaked', !calls.some((c) => c.startsWith('http://localhost:5180/api')), '');
ok('store settings loaded', text.includes('Kupaa'), '');
ok('products rendered from the API', /Honey|Gheee|Health Mix/.test(text), (text.match(/Honey|Gheee|Health Mix/g) || []).slice(0, 3).join(', '));

const imgs = [...window.document.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter(Boolean);
const uploaded = imgs.filter((s) => s.includes('/uploads/'));
ok('image URLs point at the API origin', uploaded.length > 0 && uploaded.every((s) => s.startsWith(API)), uploaded[0] ?? 'none found');

const links = [...window.document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href'));
ok('router links keep the repo sub-path', links.some((h) => h.startsWith('/kupaa-health-products/')), links.find((h) => h.startsWith('/kupaa-health-products/')) ?? links[0]);

if (errors.length) ok('console clean', false, errors[0].slice(0, 140));
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe Pages build works against a cross-origin API.');
process.exit(failures ? 1 : 0);
