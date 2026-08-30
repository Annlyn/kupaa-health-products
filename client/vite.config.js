import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));
const demoDir = resolve(here, '../demo');

/**
 * Static hosts have no history fallback: a deep link like /shop is a 404 because
 * no such file exists. GitHub Pages serves 404.html for misses, so emitting the
 * SPA there makes those URLs work. `.nojekyll` stops Pages dropping _-prefixed files.
 */
function staticHostFallback() {
  let outDir = null;
  return {
    name: 'static-host-fallback',
    apply: 'build',
    configResolved(config) {
      // Skip SSR/library builds — they produce no index.html to fall back to.
      outDir = config.build.ssr ? null : resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!outDir) return;
      const index = resolve(outDir, 'index.html');
      if (!existsSync(index)) return;
      copyFileSync(index, resolve(outDir, '404.html'));
      writeFileSync(resolve(outDir, '.nojekyll'), '');
    },
  };
}

const MEDIA_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

/**
 * Connects the app to ../demo, the throwaway catalogue used by the backend-free
 * GitHub Pages build.
 *
 * The app imports `virtual:demo` and never the folder directly, so that folder
 * is genuinely optional: delete demo/ once the real API is live and this
 * resolves to an inert stub instead — DEMO is false, the code that reads the
 * snapshot is dropped by tree-shaking, and the build still succeeds. There is
 * no other reference to demo/ anywhere in client/ or server/.
 */
function demoBridge() {
  const adapter = join(demoDir, 'adapter.js');
  const mediaDir = join(demoDir, 'media');
  const STUB = '\0virtual:demo-stub';

  const available = existsSync(adapter);
  let enabled = false;
  let outDir = null;

  return {
    name: 'demo-bridge',

    configResolved(config) {
      enabled = available && config.env.VITE_DEMO === 'true';
      outDir = config.build.ssr ? null : resolve(config.root, config.build.outDir);
      if (config.env.VITE_DEMO === 'true' && !available) {
        config.logger.warn('[demo] VITE_DEMO is set but ../demo/adapter.js is missing — building without it.');
      }
    },

    resolveId(id) {
      if (id !== 'virtual:demo') return null;
      return available ? adapter : STUB;
    },

    load(id) {
      if (id !== STUB) return null;
      // Same shape as the adapter, so importers need no conditional logic.
      return [
        'export const DEMO = false;',
        "export const DEMO_NOTICE = '';",
        "export const demoFetch = () => { throw new Error('demo mode is not bundled'); };",
        'export const demoMediaUrl = (url) => url;',
      ].join('\n');
    },

    // Vite's dev server only serves the public folder; demo media sits outside it.
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/demo-media\/([^/?#]+)/);
        const file = match && join(mediaDir, decodeURIComponent(match[1]));
        if (!file || !existsSync(file)) return next();
        res.setHeader('Content-Type', MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        return createReadStream(file).pipe(res);
      });
    },

    // Copied rather than kept in client/public so the images stay in demo/,
    // and so a non-demo build carries none of this weight.
    closeBundle() {
      if (!enabled || !outDir || !existsSync(mediaDir)) return;
      const target = join(outDir, 'demo-media');
      mkdirSync(target, { recursive: true });
      const files = readdirSync(mediaDir);
      for (const name of files) copyFileSync(join(mediaDir, name), join(target, name));
      console.log(`[demo] copied ${files.length} media file(s) to ${target}`);
    },
  };
}

export default defineConfig({
  // "/" for same-origin hosting; "/<repo>/" for a GitHub Pages project site.
  base: process.env.VITE_BASE || '/kupaa-health-products/',
  plugins: [react(), demoBridge(), staticHostFallback()],
  server: {
    port: 5173,
    // The demo folder lives outside this workspace root.
    fs: { allow: [here, demoDir] },
    // Keeps the browser on a single origin in dev so cookies "just work".
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
