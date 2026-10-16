import { defineConfig } from 'astro/config';

// GitHub Actions sets SITE_URL / BASE_PATH from actions/configure-pages
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  // ~13 KB of CSS inline saves two render-blocking requests on the first visit
  build: { inlineStylesheets: 'always' },
});
