import { defineConfig } from 'astro/config';

// GitHub Actions sets SITE_URL / BASE_PATH from actions/configure-pages
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
});
