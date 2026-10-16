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
  await expect(page.locator('[data-live="dir-long"]')).toHaveText('aus SW');
  const compass = page.locator('[data-live="compass"]');
  await expect(compass).toHaveAttribute('aria-label', 'Wind 8 km/h aus SW');
  await expect(compass.locator('[data-live="needle"]')).toHaveAttribute('style', /rotate\(224deg\)/);
  await expect(page.locator('[data-live="thumbs"] img')).toHaveCount(6);
  await expect(page.locator('img[data-live="hero"]')).toHaveAttribute('src', 'https://img.test/0.jpg');
  await expect(page.locator('[data-chart="wind"] .col')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('relay down: friendly fallback texts, photo stays, no JS errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort('connectionrefused'));
  await page.goto('/');

  await expect(page.locator('[data-live="status"]').first()).toHaveText('Wetterdaten gerade nicht verfügbar');
  await expect(page.locator('[data-live="needle"]')).toBeHidden();
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
  await expect(status).toHaveText('Letzter Messwert um 20:40 Uhr');
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

test('data from an earlier day shows its date and no chart for "today"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T09:00:00+02:00'));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8, true), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  await expect(page.locator('[data-live="status"]').first()).toHaveText('Letzter Messwert vom 15.10. um 20:40 Uhr');
  await expect(page.locator('[data-live="bars"]')).toHaveText('Heute noch keine Messwerte');
  await expect(page.locator('[data-live="thumbs"] figcaption').first()).toHaveText('15.10. 19:42');
});

test('values from an earlier refresh do not linger when the relay fails', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T20:45:00+02:00') });
  await stubImages(page);
  let calls = 0;
  await page.route(`${RELAY}/weather`, (r) => (calls++ === 0
    ? r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS })
    : r.abort('connectionrefused')));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');
  await expect(page.locator('[data-live="wind"]').first()).toHaveText('8');

  await page.clock.runFor(5 * 60 * 1000 + 1000);
  await expect(page.locator('[data-live="status"]').first()).toHaveText('Wetterdaten gerade nicht verfügbar');
  await expect(page.locator('[data-live="wind"]').first()).toHaveText('–');
  await expect(page.locator('[data-live="time"]').first()).toHaveText('');
});

test('without a WhatsApp number the join block does not promise WhatsApp', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#mitmachen')).not.toContainText('Schreib');
  await expect(page.locator('#mitmachen')).toContainText('Komm einfach am Platz vorbei');
  await page.goto('/datenschutz/');
  await expect(page.locator('main')).not.toContainText('WhatsApp');
});

test('hero marks the live webcam and opens a large view that can step through images', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  const badge = page.locator('[data-live="cam-open"]');
  await expect(badge).toContainText('Live-Webcam · 19:42');
  await badge.click();
  const dialog = page.locator('[data-live="lightbox"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute('src', 'https://img.test/0.jpg');
  await expect(dialog.getByRole('button', { name: 'Neueres Bild' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Älteres Bild' }).click();
  await expect(dialog.locator('img')).toHaveAttribute('src', 'https://img.test/1.jpg');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.locator('[data-live="thumbs"] button').nth(2).click();
  await expect(dialog.locator('img')).toHaveAttribute('src', 'https://img.test/2.jpg');
});

test('relay down: no live badge on the hero photo', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.locator('[data-live="status"]').first()).toHaveText('Wetterdaten gerade nicht verfügbar');
  await expect(page.locator('[data-live="cam-open"]')).toBeHidden();
});

test('airfield map: pin on the field, plain scroll moves the page, Ctrl+scroll zooms', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Route planen' })).toHaveAttribute('href', /to=47\.822016%2C12\.463561/);

  const map = page.locator('[data-map]');
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.map-pin')).toBeVisible();
  const zoom = () => map.locator('.leaflet-tile-container').first().evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-map] .leaflet-tile-loaded, [data-map] .leaflet-tile');
    return img?.src.match(/\/(\d+)\/\d+\/\d+\.png/)?.[1];
  });
  await expect.poll(zoom).toBe('15');

  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(page.locator('[data-map-hint]')).toHaveText('Strg + Scrollen zum Zoomen');
  await expect.poll(zoom).toBe('15');

  await map.scrollIntoViewIfNeeded();
  const b2 = (await map.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(zoom).toBe('16');
});

test('legal links point straight at the built pages (no redirect)', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.goto('/');
  for (const name of ['Impressum', 'Datenschutz']) {
    const href = await page.getByRole('link', { name }).getAttribute('href');
    expect(href).toMatch(/\/$/);
    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  }
});

test('documents and external links open in a new tab, page links do not', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort());
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ body: PIXEL, contentType: 'image/png' }));
  await page.goto('/');
  await page.locator('[data-map]').scrollIntoViewIfNeeded();
  await expect(page.locator('.leaflet-control-attribution a').first()).toBeAttached();
  const links = await page.locator('a[href]').evaluateAll((as) =>
    as.map((a) => ({ href: a.getAttribute('href')!, target: a.getAttribute('target') })));
  for (const { href, target } of links) {
    const external = /^https?:/.test(href) || href.endsWith('.pdf');
    expect(target, href).toBe(external ? '_blank' : null);
  }
});

test('own charts: wind, rose, temperature, pressure and table from relay data, with tooltips', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  const wind = page.locator('[data-chart="wind"]');
  await expect(wind.locator('svg')).toHaveAttribute('aria-label', /höchstens 8 km\/h/);
  await expect(wind.locator('.chart-legend')).toContainText('unter 15 km/h');
  await wind.locator('.col').last().hover({ force: true });
  await expect(page.locator('.chart-tip')).toBeVisible();
  await expect(page.locator('.chart-tip')).toHaveText('20:40 Uhr · 8 km/h aus SW · 14 °C · 1030 hPa');

  await page.getByText('Mehr Diagramme').click();
  await expect(page.locator('[data-chart="rose"] svg')).toHaveAttribute('aria-label', 'Windrose heute: meist aus SW');
  await expect(page.locator('[data-chart="temp"] svg')).toHaveAttribute('aria-label', 'Temperatur heute, zuletzt 14 °C');
  await expect(page.locator('[data-chart="pressure"] svg')).toHaveAttribute('aria-label', 'Luftdruck heute, zuletzt 1030 hPa');
  await expect(page.locator('[data-chart="table"] tbody tr')).toHaveCount(2);
});

test('traffic light follows the strongest wind of the last hour, not just the latest reading', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  await stubImages(page);
  const calm = weather('2026-10-15T20:40:00+02:00', 8);
  calm.today = [{ ...calm.current, time: '2026-10-15T19:30:00+02:00', windKmh: 40 }, { ...calm.current, time: '2026-10-15T20:10:00+02:00', windKmh: 20 }, calm.current];
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: calm, headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  await expect(page.locator('[data-live="wind"]').first()).toHaveText('8');
  const status = page.locator('[data-live="status"]').first();
  await expect(status).toHaveText('Böig – nur für Erfahrene');
  await expect(status).toHaveAttribute('data-level', 'gelb');
  await expect(page.locator('[data-live="peak"]').first()).toHaveText('Letzte Stunde bis 20 km/h');
});

test('forecast: summary in the hero tile and a 12-hour chart', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T10:38:00+02:00'));
  await stubImages(page);
  const hours = Array.from({ length: 24 }, (_, h) => ({
    time: `2026-10-15T${String(h).padStart(2, '0')}:00:00+02:00`,
    windKmh: h >= 13 ? 20 : 6, gustKmh: h >= 13 ? 32 : 11, windDeg: 225, windDir: 'SW', tempC: 15, rainPct: 0,
  }));
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T10:30:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.route(`${RELAY}/forecast`, (r) => r.fulfill({ json: { source: 'Open-Meteo.com', hours, stale: false }, headers: CORS }));
  await page.goto('/');

  await expect(page.locator('[data-live="forecast-summary"]')).toHaveText('Prognose: ab 13 Uhr böig');
  const chart = page.locator('[data-chart="forecast"]');
  await expect(chart.locator('.col')).toHaveCount(12);
  await expect(chart.locator('svg')).toHaveAttribute('aria-label', 'Wind-Prognose 10:00 bis 21:00 Uhr, Böen bis 32 km/h');
  await expect(chart.locator('.chart-legend')).toContainText('Böen');
});

test('forecast down: friendly message, no summary', async ({ page }) => {
  await stubImages(page);
  await page.route(`${RELAY}/**`, (r) => r.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.locator('[data-live="forecast"]')).toHaveText('Prognose gerade nicht verfügbar');
  await expect(page.locator('[data-live="forecast-summary"]')).toBeHidden();
});

test('charts show night, sunrise/sunset and flight-time strips; card text comes from the same data', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  await stubImages(page);
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');

  const wind = page.locator('[data-chart="wind"]');
  await expect(wind.locator('.night')).toHaveCount(2);
  await expect(wind.locator('.sun')).toHaveCount(2);
  await expect(wind.locator('.row-label')).toHaveText(['Elektro', 'Verbrenner', 'Hubschrauber']);
  // Thursday: electric 1, combustion 3, helicopter 2
  await expect(wind.locator('.fly')).toHaveCount(6);
  await expect(page.locator('#flugplatz')).toContainText('Mo–Sa: 10–12, 14–16 und 17:30–19 Uhr');
});

test('compass needle turns the short way round between refreshes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T20:45:00+02:00') });
  await stubImages(page);
  let calls = 0;
  await page.route(`${RELAY}/weather`, (r) => {
    const w = weather('2026-10-15T20:40:00+02:00', 8);
    w.current = { ...w.current, windDeg: calls++ === 0 ? 350 : 10, windDir: 'N' };
    return r.fulfill({ json: w, headers: CORS });
  });
  await page.route(`${RELAY}/webcam`, (r) => r.fulfill({ json: webcam, headers: CORS }));
  await page.goto('/');
  const needle = page.locator('[data-live="needle"]');
  await expect(needle).toHaveAttribute('style', /rotate\(350deg\)/);
  await page.clock.runFor(5 * 60 * 1000 + 1000);
  await expect(needle).toHaveAttribute('style', /rotate\(370deg\)/);
});

test('cold start: wind values show while the webcam is still loading; Leaflet waits for the map', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T20:45:00+02:00'));
  await stubImages(page);
  const leaflet: string[] = [];
  page.on('request', (r) => { if (/leaflet/.test(r.url())) leaflet.push(r.url()); });
  await page.route(`${RELAY}/weather`, (r) => r.fulfill({ json: weather('2026-10-15T20:40:00+02:00', 8), headers: CORS }));
  await page.route(`${RELAY}/webcam`, () => {}); // never answers
  await page.goto('/');

  await expect(page.locator('[data-live="status"]').first()).toHaveText('Gutes Flugwetter');
  await expect(page.locator('[data-live="wind"]').first()).toHaveText('8');
  expect(leaflet).toEqual([]);
  expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0);

  await page.locator('[data-map]').scrollIntoViewIfNeeded();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  expect(leaflet.some((u) => u.endsWith('.css'))).toBe(true);
});
