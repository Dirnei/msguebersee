import { expect, test, type Page } from '@playwright/test';

const RELAY = 'https://relay.test';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
// Chromium applies CORS to fulfilled routes, so mocked relay answers need the header
const CORS = { 'access-control-allow-origin': '*' };

function weather(time: string, windKmh: number, stale = false) {
  const p = { time, windDir: 'SW', windDeg: 224, windKmh, tempC: 14, pressureHpa: 1030 };
  return { updated: time, current: p, today: [{ ...p, time: time.replace(/T\d\d:\d\d/, 'T00:01') }, p], stale };
}

const webcam = {
  images: Array.from({ length: 8 }, (_, i) => ({ url: `https://img.test/${i}.jpg`, time: `2026-10-15T19:${String(42 - i).padStart(2, '0')}:00+02:00` })),
  stale: false,
};

async function stubImages(page: Page) {
  await page.route('https://img.test/**', (r) => r.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.route('https://xn--msg-bersee-deb.de/**', (r) => r.fulfill({ body: PIXEL, contentType: 'image/png' }));
}

test('shows live values, traffic light and webcam when the relay answers', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  const status = page.locator('[data-live="status"]').first();
  await expect(status).toHaveText('Gutes Flugwetter');
  await expect(status).toHaveAttribute('data-level', 'gruen');
  await expect(page.locator('[data-live="wind"]').first()).toHaveText('8');
  await expect(page.locator('[data-live="thumbs"] img')).toHaveCount(6);
  await expect(page.locator('img[data-live="hero"]')).toHaveAttribute('src', 'https://img.test/0.jpg');
  await expect(page.locator('.wind-bars rect')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('relay down: friendly fallback texts, photo stays, no JS errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort('connectionrefused'));
  await page.goto('/');

  await expect(page.locator('[data-live="status"]').first()).toHaveText('Wetterdaten gerade nicht verfügbar');
  await expect(page.locator('[data-live="bars"]')).toHaveText('Messwerte gerade nicht verfügbar');
  await expect(page.locator('[data-live="thumbs"]')).toHaveText('Webcam gerade nicht verfügbar');
  await expect(page.locator('img[data-live="hero"]')).not.toHaveAttribute('src', /img\.test/);
  expect(errors).toEqual([]);
});

test('stale or old station data never shows a green light', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T23:00:00+02:00'));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  const status = page.locator('[data-live="status"]').first();
  await expect(status).toHaveText('Letzter Messwert von 20:40 Uhr');
  await expect(status).toHaveAttribute('data-level', 'off');
});

test('empty day right after midnight', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: { updated: null, current: null, today: [], stale: false }, headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  await expect(page.locator('[data-live="status"]').first()).toHaveText('Heute noch keine Messwerte');
  await expect(page.locator('[data-live="bars"]')).toHaveText('Heute noch keine Messwerte');
});

test('phone width: no horizontal scroll, Mitmachen reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.goto('/');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await page.getByRole('link', { name: 'Mitmachen' }).click();
  await expect(page.locator('#mitmachen')).toBeInViewport();
});

test('legal pages and documents are linked', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.goto('/');
  await page.getByRole('link', { name: 'Impressum' }).click();
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.getByText('VR 1083')).toBeVisible();
  const res = await page.request.get('/dokumente/platzordnung.pdf');
  expect(res.headers()['content-type']).toContain('pdf');
});
