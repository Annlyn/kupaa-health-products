import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  // "/" for same-origin hosting; "/<repo>/" for a GitHub Pages project site.
  base: process.env.VITE_BASE || '/kupaa-health-products/',
  plugins: [react(), staticHostFallback()],
  server: {
    port: 5173,
    // Keeps the browser on a single origin in dev so cookies "just work".
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
