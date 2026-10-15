# MSG Übersee Website + Wetter-Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue, wartungsfreie Vereinsseite (Astro, GitHub Pages) mit Live-Wetter und Webcam vom Flugplatz, gespeist von einem kleinen Docker-Relay, das die alten PHP-Seiten der Wetterstation in JSON übersetzt.

**Architecture:** Monorepo. `relay/` ist ein abhängigkeitsfreier Node-HTTP-Dienst: Er liest `auslesen_tabelle.php` und `Bildtest-email.php`, parst das HTML, cached 5 Minuten und liefert JSON mit CORS. `site/` ist eine statische Astro-Seite. Ein Client-Skript holt beim Laden und danach alle 5 Minuten die Daten vom Relay und degradiert sauber, wenn das Relay fehlt. Alle Vereinsangaben stehen in einer Datei `site/src/data/verein.ts`.

**Tech Stack:** Node 24 (`node:http`, `node:test`, global `fetch`), Docker, Astro 7 (`astro:assets`), TypeScript, Vitest, Playwright, GitHub Actions (Pages + GHCR).

**Spec:** `docs/superpowers/specs/2026-10-15-msg-website-design.md`

## Global Constraints

- Relay: **keine Laufzeit-Abhängigkeiten** (nur Node-Standardbibliothek), ESM (`"type": "module"`), Node ≥ 24.
- Relay-Umgebung: `PORT` (Standard `8080`), `UPSTREAM_BASE` (Standard `https://xn--msg-bersee-deb.de/Programme/`), `ALLOWED_ORIGINS` (kommagetrennt), `CACHE_SECONDS` (Standard `300`).
- Upstream-Zeiten sind lokale Zeit `Europe/Berlin`. Das Relay gibt ISO-8601 mit Offset aus, z. B. `2026-10-15T20:40:00+02:00`.
- Akzentfarbe `#0090DA`, Text `#14212C`, helle Fläche `#F4F7FA`. **Kein Orange.** Systemschrift-Stack, keine externen Font-CDNs.
- Kontakt auf der Seite nur über WhatsApp. Die E-Mail `vorstand@msg-übersee.de` erscheint nur im Impressum.
- **Auf der Seite erscheint nie ein Platzhaltertext.** Offene Angaben stehen als `TODO(Verein)` im Code-Kommentar. Fehlt eine Angabe, wird der Teil ausgeblendet oder neutral ersetzt.
- Relay-URL zur Build-Zeit aus `PUBLIC_RELAY_URL` (in der CI aus der Repo-Variable `RELAY_URL`). Leer bedeutet: Live-Funktionen aus.
- Copy-Regeln: „Gut zu wissen“-Kacheln **ohne Nummerierung bzw. Reihenfolge**. Mitfliegen am Lehrer-Schüler-Sender heißt „auf Anfrage“. Selbst fliegen nur als Mitglied oder mit Erlaubnis des Vorstands.
- Commit-Messages: **eine Zeile, max. 74 Zeichen, kein Body, keine Trailer.**

## Review Focus

1. **Tabelle mit kaputter Zeile** (leere Zelle, `--`, fehlende Richtung): Die Zeile wird übersprungen, der Rest kommt durch. Getestet in Task 2.
2. **Kurz nach Mitternacht hat die Station 0 Datensätze:** `/weather` liefert `current: null, today: []` mit Status 200, und die Seite zeigt „Heute noch keine Messwerte“. Getestet in Task 2 (Parser), Task 4 (App) und Task 8 (Bars).
3. **Minusgrade im Winter (`-3`):** Werden als negative Zahl geparst und nicht verworfen. Getestet in Task 2.
4. **Station hängt oder ist offline:** Der Abruf bricht nach 10 s ab. Das Relay liefert den letzten Stand mit `stale: true` und fragt den Upstream höchstens einmal pro Minute erneut an. Die Seite zeigt „Letzter Messwert von HH:MM Uhr“ statt der Ampel. Getestet in Task 3 (Cache) und Task 11 (E2E).
5. **Relay läuft, aber die Station liefert seit Stunden nichts Neues** (Tab bleibt offen, Werte älter als 30 Min.): Die Ampel wird nicht grün, sondern zeigt den Zeitstempel. Getestet in Task 8 (`isOutdated`) und Task 11 (E2E mit fester Uhr).

---

## File Structure

```
.github/workflows/relay.yml     Relay: Tests, Docker-Image → GHCR
.github/workflows/site.yml      Site: Tests, E2E, Build → GitHub Pages
relay/
  package.json                  scripts: test, start
  Dockerfile
  README.md                     Betrieb hinter dem Reverse Proxy
  src/time.js                   berlinLocalToIso()
  src/parse-weather.js          parseWeather(html)
  src/parse-webcam.js           parseWebcam(html, upstreamBase)
  src/cache.js                  createCache(load, opts)
  src/fetch-text.js             fetchText(url)
  src/config.js                 readConfig(env)
  src/app.js                    createApp({ config, fetchText, now }) → request handler
  src/server.js                 Einstiegspunkt
  test/fixtures/*.html          echte Upstream-Antworten vom 2026-10-15 (bereits im Repo)
  test/*.test.js
site/
  package.json, astro.config.mjs, tsconfig.json, vitest.config.ts, playwright.config.ts
  public/msg-logo.svg           Kopie von brand/msg-logo.svg
  public/dokumente/satzung.pdf, platzordnung.pdf
  src/assets/photos/*.jpg       Fotos von der alten Seite
  src/data/verein.ts            ALLE Vereinsangaben
  src/lib/paths.ts              withBase()
  src/lib/weather.ts            Typen, ampel(), formatClock(), isOutdated(), windBarsSvg()
  src/lib/weather.test.ts
  src/scripts/live.ts           Browser: Relay abfragen, DOM aktualisieren
  src/styles/global.css
  src/layouts/Base.astro
  src/components/Header.astro, Footer.astro, Hero.astro, LiveTile.astro,
                 WeatherSection.astro, Polaroid.astro, WhatWeDo.astro,
                 GoodToKnow.astro, Airfield.astro, JoinCta.astro
  src/pages/index.astro, impressum.astro, datenschutz.astro
  tests/home.spec.ts            Playwright
```

---

### Task 1: Relay-Grundgerüst und Berliner Zeit → ISO

**Files:**
- Create: `relay/package.json`, `relay/src/time.js`
- Test: `relay/test/time.test.js`

**Interfaces:**
- Produces: `berlinLocalToIso(local: string): string | null` erwartet `"YYYY-MM-DD HH:MM"` (lokale Berliner Zeit) und liefert `"YYYY-MM-DDTHH:MM:00+HH:MM"`. Bei ungültiger Eingabe gibt sie `null` zurück.

- [ ] **Step 1: package.json anlegen**

```json
{
  "name": "msg-relay",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Failing test schreiben** – `relay/test/time.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berlinLocalToIso } from '../src/time.js';

test('summer time gets +02:00', () => {
  assert.equal(berlinLocalToIso('2026-10-15 20:40'), '2026-10-15T20:40:00+02:00');
});

test('winter time gets +01:00', () => {
  assert.equal(berlinLocalToIso('2026-01-15 07:05'), '2026-01-15T07:05:00+01:00');
});

test('surrounding whitespace is ignored', () => {
  assert.equal(berlinLocalToIso('  2026-10-15 00:01 '), '2026-10-15T00:01:00+02:00');
});

test('invalid input returns null', () => {
  for (const bad of ['', 'Datum/Uhrzeit', '2026-10-15', '15.10.2026 20:40', undefined]) {
    assert.equal(berlinLocalToIso(bad), null, String(bad));
  }
});
```

- [ ] **Step 3: Test laufen lassen, muss fehlschlagen**

Run: `cd relay && npm test`
Expected: FAIL mit `Cannot find module '../src/time.js'`

- [ ] **Step 4: Implementieren** – `relay/src/time.js`

```js
const FORMAT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const OFFSET = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });

export function berlinLocalToIso(local) {
  const m = FORMAT.exec(String(local ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // offset at the guessed instant, then re-check at the corrected instant (DST edges)
  const offset = offsetMinutes(asUtc - offsetMinutes(asUtc) * 60_000);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${y}-${mo}-${d}T${h}:${mi}:00${sign}${pad(Math.trunc(abs / 60))}:${pad(abs % 60)}`;
}

function offsetMinutes(timestamp) {
  const name = OFFSET.formatToParts(timestamp).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

function pad(n) {
  return String(n).padStart(2, '0');
}
```

- [ ] **Step 5: Test laufen lassen, muss grün sein**

Run: `cd relay && npm test`
Expected: PASS, 4 Tests

- [ ] **Step 6: Commit**

```bash
git add relay/package.json relay/src/time.js relay/test/time.test.js
git commit -m "Add relay skeleton with Berlin local time to ISO conversion"
```

---

### Task 2: Wetter-HTML parsen

**Files:**
- Create: `relay/src/parse-weather.js`
- Test: `relay/test/parse-weather.test.js`
- Uses fixture: `relay/test/fixtures/auslesen_tabelle.html` (liegt bereits im Repo: 124 Zeilen, erste `2026-10-15 00:01 NO/57 2 12 1032`, letzte `2026-10-15 20:40 SW/203 14 16 1029`)

**Interfaces:**
- Consumes: `berlinLocalToIso` (Task 1)
- Produces: `parseWeather(html: string): { current: Point | null, today: Point[] }` mit
  `Point = { time: string, windDir: string, windDeg: number, windKmh: number, tempC: number, pressureHpa: number }`. `today` ist chronologisch aufsteigend sortiert, `current` ist der letzte Eintrag.

- [ ] **Step 1: Failing tests schreiben** – `relay/test/parse-weather.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeather } from '../src/parse-weather.js';

const fixture = readFileSync(new URL('./fixtures/auslesen_tabelle.html', import.meta.url), 'utf8');

const row = (cells) => `<tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>`;
const table = (...rows) => `<html><body><table>${row(['Datum/Uhrzeit&nbsp;', 'Windrichtung/Grad', 'Geschw./kmh', 'Temp./C°', 'Luftdruck/mbar', 'Spannung/Volt'])}${rows.join('')}</table></body></html>`;

test('parses every data row of the real fixture', () => {
  const { today, current } = parseWeather(fixture);
  assert.equal(today.length, 124);
  assert.deepEqual(today[0], {
    time: '2026-10-15T00:01:00+02:00', windDir: 'NO', windDeg: 57, windKmh: 2, tempC: 12, pressureHpa: 1032,
  });
  assert.deepEqual(current, {
    time: '2026-10-15T20:40:00+02:00', windDir: 'SW', windDeg: 203, windKmh: 14, tempC: 16, pressureHpa: 1029,
  });
});

test('skips malformed rows and keeps the rest', () => {
  const html = table(
    row(['2026-10-15 10:00', 'S/180', '5', '10', '1020', '12,3']),
    row(['2026-10-15 10:10', '--', '5', '10', '1020', '12,3']),
    row(['2026-10-15 10:20', 'S/180', '', '10', '1020', '12,3']),
    row(['kaputt', 'S/180', '5', '10', '1020', '12,3']),
    row(['2026-10-15 10:30', 'NW/315', '7', '11', '1019', '12,3']),
  );
  const { today } = parseWeather(html);
  assert.deepEqual(today.map((p) => p.time), ['2026-10-15T10:00:00+02:00', '2026-10-15T10:30:00+02:00']);
});

test('negative temperatures are kept', () => {
  const { current } = parseWeather(table(row(['2026-01-15 07:00', 'O/90', '3', '-3', '1030', '12,1'])));
  assert.equal(current.tempC, -3);
});

test('rows are sorted chronologically', () => {
  const { today, current } = parseWeather(table(
    row(['2026-10-15 10:30', 'N/0', '1', '1', '1000', '12']),
    row(['2026-10-15 10:10', 'N/0', '1', '1', '1000', '12']),
  ));
  assert.deepEqual(today.map((p) => p.time.slice(11, 16)), ['10:10', '10:30']);
  assert.equal(current.time.slice(11, 16), '10:30');
});

test('a table without data rows gives empty result, not an error', () => {
  assert.deepEqual(parseWeather(table()), { current: null, today: [] });
  assert.deepEqual(parseWeather(''), { current: null, today: [] });
});
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `cd relay && npm test`
Expected: FAIL mit `Cannot find module '../src/parse-weather.js'`

- [ ] **Step 3: Implementieren** – `relay/src/parse-weather.js`

```js
import { berlinLocalToIso } from './time.js';

const ROW = /<tr>([\s\S]*?)<\/tr>/gi;
const CELL = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
const DIRECTION = /^([NOSW]{1,3})\/(\d{1,3})$/;
const NUMBER = /^-?\d+(?:,\d+)?$/;

export function parseWeather(html) {
  const today = [];
  for (const [, row] of String(html).matchAll(ROW)) {
    const cells = [...row.matchAll(CELL)].map(([, c]) => c.replace(/&nbsp;/g, ' ').trim());
    const point = toPoint(cells);
    if (point) today.push(point);
  }
  today.sort((a, b) => a.time.localeCompare(b.time));
  return { current: today.at(-1) ?? null, today };
}

function toPoint([when, direction, wind, temp, pressure]) {
  const time = berlinLocalToIso(when);
  const dir = DIRECTION.exec(direction ?? '');
  const windKmh = toNumber(wind);
  const tempC = toNumber(temp);
  const pressureHpa = toNumber(pressure);
  if (!time || !dir || windKmh === null || tempC === null || pressureHpa === null) return null;
  return { time, windDir: dir[1], windDeg: Number(dir[2]), windKmh, tempC, pressureHpa };
}

function toNumber(text) {
  return NUMBER.test(text ?? '') ? Number(text.replace(',', '.')) : null;
}
```

- [ ] **Step 4: Tests laufen lassen, müssen grün sein**

Run: `cd relay && npm test`
Expected: PASS (alle Tests aus Task 1 und 2)

- [ ] **Step 5: Commit**

```bash
git add relay/src/parse-weather.js relay/test/parse-weather.test.js relay/test/fixtures
git commit -m "Parse weather station HTML table into JSON points"
```

---

### Task 3: Webcam-HTML parsen und Cache

**Files:**
- Create: `relay/src/parse-webcam.js`, `relay/src/cache.js`
- Test: `relay/test/parse-webcam.test.js`, `relay/test/cache.test.js`
- Uses fixture: `relay/test/fixtures/bildtest_email.html` (24 Bilder, neuestes `2026-10-15 19:42 -- 151942.jpg`, ältestes `2026-10-15 07:35 -- 150735.jpg`)

**Interfaces:**
- Consumes: `berlinLocalToIso` (Task 1)
- Produces:
  - `parseWebcam(html: string, upstreamBase: string): { url: string, time: string }[]`, neuestes Bild zuerst. `url` ist absolut: `new URL('bilder/<datei>', upstreamBase)`.
  - `createCache(load: () => Promise<T>, { ttlMs: number, retryMs: number, now?: () => number }): () => Promise<{ value: T, stale: boolean }>`. Die Funktion wirft nur, wenn es noch nie einen erfolgreichen Abruf gab.

- [ ] **Step 1: Failing tests für den Webcam-Parser schreiben** – `relay/test/parse-webcam.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebcam } from '../src/parse-webcam.js';

const BASE = 'https://xn--msg-bersee-deb.de/Programme/';
const fixture = readFileSync(new URL('./fixtures/bildtest_email.html', import.meta.url), 'utf8');

test('parses all images of the real fixture, newest first', () => {
  const images = parseWebcam(fixture, BASE);
  assert.equal(images.length, 24);
  assert.deepEqual(images[0], {
    url: 'https://xn--msg-bersee-deb.de/Programme/bilder/151942.jpg',
    time: '2026-10-15T19:42:00+02:00',
  });
  assert.equal(images.at(-1).time, '2026-10-15T07:35:00+02:00');
});

test('ignores entries with odd file names or broken dates', () => {
  const html = '<FONT SIZE=4>2026-10-15 10:00 -- ../../etc.jpg</FONT>'
    + '<FONT SIZE=4>gestern -- 1.jpg</FONT>'
    + '<FONT SIZE=4>2026-10-15 11:00 -- 151100.jpg</FONT>';
  assert.deepEqual(parseWebcam(html, BASE).map((i) => i.url), [`${BASE}bilder/151100.jpg`]);
});

test('page without images gives empty list', () => {
  assert.deepEqual(parseWebcam('MSG-ÜBERSEE<br>', BASE), []);
});
```

- [ ] **Step 2: Failing tests für den Cache schreiben** – `relay/test/cache.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/cache.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function loader(results) {
  const calls = { count: 0 };
  const load = async () => {
    const r = results[Math.min(calls.count++, results.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { load, calls };
}

const opts = (c) => ({ ttlMs: 300_000, retryMs: 60_000, now: c.now });

test('serves cached value within ttl', async () => {
  const c = clock();
  const { load, calls } = loader(['a', 'b']);
  const get = createCache(load, opts(c));
  assert.deepEqual(await get(), { value: 'a', stale: false });
  c.advance(299_000);
  assert.deepEqual(await get(), { value: 'a', stale: false });
  assert.equal(calls.count, 1);
});

test('reloads after ttl', async () => {
  const c = clock();
  const { load } = loader(['a', 'b']);
  const get = createCache(load, opts(c));
  await get();
  c.advance(300_000);
  assert.deepEqual(await get(), { value: 'b', stale: false });
});

test('upstream failure serves last value as stale and backs off', async () => {
  const c = clock();
  const { load, calls } = loader(['a', new Error('down'), 'c']);
  const get = createCache(load, opts(c));
  await get();
  c.advance(300_000);
  assert.deepEqual(await get(), { value: 'a', stale: true });
  c.advance(30_000);
  assert.deepEqual(await get(), { value: 'a', stale: true });
  assert.equal(calls.count, 2, 'no retry within retryMs');
  c.advance(30_000);
  assert.deepEqual(await get(), { value: 'c', stale: false });
});

test('failure without any cached value throws, and backs off too', async () => {
  const c = clock();
  const { load, calls } = loader([new Error('down'), 'b']);
  const get = createCache(load, opts(c));
  await assert.rejects(get(), /down/);
  await assert.rejects(get(), /down/);
  assert.equal(calls.count, 1);
  c.advance(60_000);
  assert.deepEqual(await get(), { value: 'b', stale: false });
});

test('concurrent requests share one upstream load', async () => {
  const c = clock();
  const { load, calls } = loader(['a']);
  const get = createCache(load, opts(c));
  const results = await Promise.all([get(), get(), get()]);
  assert.equal(calls.count, 1);
  assert.ok(results.every((r) => r.value === 'a'));
});
```

- [ ] **Step 3: Tests laufen lassen, müssen fehlschlagen**

Run: `cd relay && npm test`
Expected: FAIL mit `Cannot find module '../src/parse-webcam.js'` bzw. `'../src/cache.js'`

- [ ] **Step 4: Webcam-Parser implementieren** – `relay/src/parse-webcam.js`

```js
import { berlinLocalToIso } from './time.js';

const ENTRY = /<FONT[^>]*>\s*([^<]*?)\s*--\s*([\w-]+\.jpe?g)\s*<\/FONT>/gi;

export function parseWebcam(html, upstreamBase) {
  const images = [];
  for (const [, when, file] of String(html).matchAll(ENTRY)) {
    const time = berlinLocalToIso(when);
    if (time) images.push({ url: new URL(`bilder/${file}`, upstreamBase).href, time });
  }
  return images.sort((a, b) => b.time.localeCompare(a.time));
}
```

- [ ] **Step 5: Cache implementieren** – `relay/src/cache.js`

```js
export function createCache(load, { ttlMs, retryMs, now = Date.now }) {
  let entry = null; // { value, at }
  let failure = null; // { error, at }
  let inflight = null;

  return async function get() {
    const t = now();
    if (entry && t - entry.at < ttlMs) return { value: entry.value, stale: false };
    if (failure && t - failure.at < retryMs) {
      if (entry) return { value: entry.value, stale: true };
      throw failure.error;
    }
    inflight ??= load()
      .then((value) => {
        entry = { value, at: now() };
        failure = null;
        return value;
      })
      .catch((error) => {
        failure = { error, at: now() };
        throw error;
      })
      .finally(() => {
        inflight = null;
      });
    try {
      return { value: await inflight, stale: false };
    } catch (error) {
      if (entry) return { value: entry.value, stale: true };
      throw error;
    }
  };
}
```

- [ ] **Step 6: Tests laufen lassen, müssen grün sein**

Run: `cd relay && npm test`
Expected: PASS (alle Tests)

- [ ] **Step 7: Commit**

```bash
git add relay/src/parse-webcam.js relay/src/cache.js relay/test/parse-webcam.test.js relay/test/cache.test.js
git commit -m "Parse webcam image list and add stale-tolerant cache"
```

---

### Task 4: HTTP-App, Konfiguration und Server

**Files:**
- Create: `relay/src/config.js`, `relay/src/fetch-text.js`, `relay/src/app.js`, `relay/src/server.js`
- Test: `relay/test/config.test.js`, `relay/test/app.test.js`

**Interfaces:**
- Consumes: `parseWeather` (Task 2), `parseWebcam`, `createCache` (Task 3)
- Produces:
  - `readConfig(env): { port: number, upstreamBase: string, allowedOrigins: string[], cacheMs: number }`
  - `fetchText(url: string, { timeoutMs?: number }): Promise<string>`
  - `createApp({ config, fetchText, now? }): (req, res) => Promise<void>`
  - HTTP: `GET /health` → `200 ok`. `GET /weather` → `{ updated, current, today, stale }`. `GET /webcam` → `{ images, stale }`. `GET /webcam/latest.jpg` → `302` auf `images[0].url`. Bei Upstream-Fehler ohne Cache → `503 { error }`. Bei unbekanntem Pfad → `404`.

- [ ] **Step 1: Failing tests schreiben** – `relay/test/config.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

test('defaults', () => {
  assert.deepEqual(readConfig({}), {
    port: 8080,
    upstreamBase: 'https://xn--msg-bersee-deb.de/Programme/',
    allowedOrigins: [],
    cacheMs: 300_000,
  });
});

test('reads env and normalises values', () => {
  const c = readConfig({
    PORT: '9000',
    UPSTREAM_BASE: 'http://example.test/x',
    ALLOWED_ORIGINS: 'https://a.github.io, https://msg.example ,',
    CACHE_SECONDS: '60',
  });
  assert.deepEqual(c, {
    port: 9000,
    upstreamBase: 'http://example.test/x/',
    allowedOrigins: ['https://a.github.io', 'https://msg.example'],
    cacheMs: 60_000,
  });
});
```

- [ ] **Step 2: Failing tests schreiben** – `relay/test/app.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const BASE = 'https://xn--msg-bersee-deb.de/Programme/';
const ORIGIN = 'https://verein.github.io';

async function start(fetchText) {
  const config = { port: 0, upstreamBase: BASE, allowedOrigins: [ORIGIN], cacheMs: 300_000 };
  const server = createServer(createApp({ config, fetchText }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

const upstream = async (u) => {
  if (u === `${BASE}auslesen_tabelle.php`) return fixture('auslesen_tabelle.html');
  if (u === `${BASE}Bildtest-email.php`) return fixture('bildtest_email.html');
  throw new Error(`unexpected ${u}`);
};

test('GET /weather returns parsed data with CORS for allowed origin', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const res = await fetch(`${s.url}/weather`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await res.json();
  assert.equal(body.stale, false);
  assert.equal(body.updated, '2026-10-15T20:40:00+02:00');
  assert.equal(body.current.windKmh, 14);
  assert.equal(body.today.length, 124);
});

test('foreign origins get no CORS header', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const res = await fetch(`${s.url}/weather`, { headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('GET /webcam and /webcam/latest.jpg', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const body = await (await fetch(`${s.url}/webcam`)).json();
  assert.equal(body.images.length, 24);
  const res = await fetch(`${s.url}/webcam/latest.jpg`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${BASE}bilder/151942.jpg`);
});

test('station with zero rows is a valid empty day', async (t) => {
  const s = await start(async () => '<table><tr><th>Datum/Uhrzeit</th></tr></table>');
  t.after(s.close);
  const body = await (await fetch(`${s.url}/weather`)).json();
  assert.deepEqual(body, { updated: null, current: null, today: [], stale: false });
});

test('upstream down without cache gives 503', async (t) => {
  const s = await start(async () => { throw new Error('timeout'); });
  t.after(s.close);
  const res = await fetch(`${s.url}/weather`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'upstream unavailable' });
});

test('webcam page without images gives 503', async (t) => {
  const s = await start(async () => 'MSG-ÜBERSEE<br>');
  t.after(s.close);
  assert.equal((await fetch(`${s.url}/webcam`)).status, 503);
});

test('health, 404 and method handling', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  assert.equal(await (await fetch(`${s.url}/health`)).text(), 'ok');
  assert.equal((await fetch(`${s.url}/nope`)).status, 404);
  assert.equal((await fetch(`${s.url}/weather`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${s.url}/weather`, { method: 'OPTIONS', headers: { origin: ORIGIN } })).status, 204);
});
```

- [ ] **Step 3: Tests laufen lassen, müssen fehlschlagen**

Run: `cd relay && npm test`
Expected: FAIL mit `Cannot find module '../src/config.js'` bzw. `'../src/app.js'`

- [ ] **Step 4: Konfiguration implementieren** – `relay/src/config.js`

```js
export function readConfig(env) {
  const base = env.UPSTREAM_BASE ?? 'https://xn--msg-bersee-deb.de/Programme/';
  return {
    port: Number(env.PORT ?? 8080),
    upstreamBase: base.endsWith('/') ? base : `${base}/`,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    cacheMs: Number(env.CACHE_SECONDS ?? 300) * 1000,
  };
}
```

- [ ] **Step 5: Upstream-Abruf implementieren** – `relay/src/fetch-text.js`

```js
export async function fetchText(url, { timeoutMs = 10_000 } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'msg-relay/1.0' },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
```

- [ ] **Step 6: App implementieren** – `relay/src/app.js`

```js
import { createCache } from './cache.js';
import { parseWeather } from './parse-weather.js';
import { parseWebcam } from './parse-webcam.js';

const RETRY_MS = 60_000;

export function createApp({ config, fetchText, now = Date.now }) {
  const opts = { ttlMs: config.cacheMs, retryMs: RETRY_MS, now };
  const weather = createCache(async () => parseWeather(await fetchText(`${config.upstreamBase}auslesen_tabelle.php`)), opts);
  const webcam = createCache(async () => {
    const images = parseWebcam(await fetchText(`${config.upstreamBase}Bildtest-email.php`), config.upstreamBase);
    if (images.length === 0) throw new Error('no webcam images found');
    return images;
  }, opts);

  return async function handle(req, res) {
    const origin = req.headers.origin;
    res.setHeader('vary', 'Origin');
    if (origin && config.allowedOrigins.includes(origin)) res.setHeader('access-control-allow-origin', origin);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET' });
      return res.end();
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

    const path = new URL(req.url, 'http://relay').pathname;
    try {
      switch (path) {
        case '/health':
          res.writeHead(200, { 'content-type': 'text/plain' });
          return res.end('ok');
        case '/weather': {
          const { value, stale } = await weather();
          return sendJson(res, 200, { updated: value.current?.time ?? null, current: value.current, today: value.today, stale });
        }
        case '/webcam': {
          const { value, stale } = await webcam();
          return sendJson(res, 200, { images: value, stale });
        }
        case '/webcam/latest.jpg': {
          const { value } = await webcam();
          res.writeHead(302, { location: value[0].url, 'cache-control': 'no-store' });
          return res.end();
        }
        default:
          return sendJson(res, 404, { error: 'not found' });
      }
    } catch (error) {
      console.error(`${path}: ${error.message}`);
      return sendJson(res, 503, { error: 'upstream unavailable' });
    }
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=60' : 'no-store',
  });
  res.end(JSON.stringify(body));
}
```

- [ ] **Step 7: Einstiegspunkt** – `relay/src/server.js`

```js
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { fetchText } from './fetch-text.js';

const config = readConfig(process.env);
const server = createServer(createApp({ config, fetchText }));
server.listen(config.port, () => {
  console.log(`msg-relay listening on :${config.port}, origins: ${config.allowedOrigins.join(', ') || '(none)'}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
```

- [ ] **Step 8: Tests laufen lassen, müssen grün sein**

Run: `cd relay && npm test`
Expected: PASS (alle Tests)

- [ ] **Step 9: Live-Probe gegen die echte Station** (manuell, keine Testdatei)

Run: `cd relay && ALLOWED_ORIGINS=http://localhost:4321 PORT=8089 node src/server.js` und in einer zweiten Shell `curl -s localhost:8089/weather | head -c 300; curl -sI localhost:8089/webcam/latest.jpg | head -3`
Expected: JSON mit `"current":{"time":"<heute>…"` und `HTTP/1.1 302` mit `location: https://xn--msg-bersee-deb.de/Programme/bilder/….jpg`. Danach den Server stoppen.

- [ ] **Step 10: Commit**

```bash
git add relay/src relay/test
git commit -m "Serve weather and webcam JSON with CORS, cache and 503 fallback"
```

---

### Task 5: Relay als Docker-Image, Doku und CI

**Files:**
- Create: `relay/Dockerfile`, `relay/.dockerignore`, `relay/README.md`, `.github/workflows/relay.yml`

**Interfaces:**
- Consumes: `relay/src/server.js` (Task 4)
- Produces: Image `ghcr.io/<owner-lowercase>/msg-relay:latest` (Port 8080, Healthcheck `/health`)

- [ ] **Step 1: Dockerfile** – `relay/Dockerfile`

```dockerfile
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "src/server.js"]
```

`relay/.dockerignore`:

```
test
node_modules
README.md
```

- [ ] **Step 2: Image lokal bauen und starten**

Run:
```bash
docker build -t msg-relay:dev relay
docker run --rm -d --name msg-relay-test -p 8089:8080 -e ALLOWED_ORIGINS=http://localhost:4321 msg-relay:dev
curl -s localhost:8089/health; echo
curl -s localhost:8089/weather | head -c 200; echo
docker rm -f msg-relay-test
```
Expected: `ok`, danach JSON, das mit `{"updated":"` beginnt

- [ ] **Step 3: README** – `relay/README.md`

````markdown
# msg-relay

Kleiner Dienst, der die alte Wetterstation und Webcam (`Programme/*.php` auf msg-übersee.de)
als JSON für die neue Website bereitstellt. Keine Datenbank, keine Abhängigkeiten.

## Endpunkte

| Pfad | Inhalt |
|---|---|
| `/weather` | aktuelle Werte + Tagesverlauf (`stale: true` = Station gerade nicht erreichbar, letzter Stand) |
| `/webcam` | letzte Webcam-Bilder, neuestes zuerst |
| `/webcam/latest.jpg` | Weiterleitung auf das neueste Bild |
| `/health` | `ok` |

## Betrieb

```yaml
# docker-compose.yml
services:
  msg-relay:
    image: ghcr.io/<owner>/msg-relay:latest
    restart: unless-stopped
    environment:
      ALLOWED_ORIGINS: https://<owner>.github.io
    ports:
      - "127.0.0.1:8089:8080"
```

HTTPS übernimmt der Reverse Proxy (z. B. `wetter.example.de` → `127.0.0.1:8089`).
Die öffentliche HTTPS-URL im GitHub-Repo unter *Settings → Secrets and variables → Actions → Variables*
als `RELAY_URL` eintragen; die Website wird beim nächsten Build damit gebaut.

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8080` | Port im Container |
| `UPSTREAM_BASE` | `https://xn--msg-bersee-deb.de/Programme/` | alte Station |
| `ALLOWED_ORIGINS` | – | erlaubte Website-Origins, kommagetrennt |
| `CACHE_SECONDS` | `300` | so lange werden Upstream-Antworten wiederverwendet |

Hinweis: `auslesen_tabelle.php` löscht bei jedem Aufruf alte Datensätze (Verhalten der Station).
Durch den Cache wird sie höchstens alle 5 Minuten aufgerufen.

## Entwicklung

```bash
npm test
ALLOWED_ORIGINS=http://localhost:4321 PORT=8089 npm start
```
````

- [ ] **Step 4: CI-Workflow** – `.github/workflows/relay.yml`

```yaml
name: Relay

on:
  push:
    branches: [main]
    paths: ['relay/**', '.github/workflows/relay.yml']
  pull_request:
    paths: ['relay/**', '.github/workflows/relay.yml']
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  test-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm test
        working-directory: relay
      - id: image
        run: echo "name=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/msg-relay" >> "$GITHUB_OUTPUT"
      - if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: relay
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ steps.image.outputs.name }}:latest
            ${{ steps.image.outputs.name }}:${{ github.sha }}
```

- [ ] **Step 5: Commit**

```bash
git add relay/Dockerfile relay/.dockerignore relay/README.md .github/workflows/relay.yml
git commit -m "Add relay Dockerfile, README and GHCR publish workflow"
```

---

### Task 6: Astro-Grundgerüst, Layout, Kopf- und Fußzeile, Pages-Deploy

**Files:**
- Create: `site/` (Astro-Gerüst), `site/astro.config.mjs`, `site/vitest.config.ts`, `site/src/lib/paths.ts`, `site/src/styles/global.css`, `site/src/layouts/Base.astro`, `site/src/components/Header.astro`, `site/src/components/Footer.astro`, `site/src/pages/index.astro`, `site/public/msg-logo.svg`, `site/public/dokumente/satzung.pdf`, `site/public/dokumente/platzordnung.pdf`, `.github/workflows/site.yml`

**Interfaces:**
- Produces:
  - `withBase(path: string): string`: hängt den Astro-Base-Pfad davor, z. B. `withBase('impressum')` → `/<repo>/impressum`.
  - `Base.astro` mit Props `{ title: string; description: string }` und einem Default-Slot.
  - CSS-Klassen aus `global.css`, die später verwendet werden: `.container`, `.band` (helle Sektion), `.eyebrow`, `.btn`, `.btn-lg`, `.card`, `.muted`.

- [ ] **Step 1: Astro-Projekt erzeugen**

Run (im Repo-Root):
```bash
npm create astro@latest site -- --template minimal --install --no-git --yes
cd site && npm install -D vitest @playwright/test @astrojs/check typescript
```
Expected: `site/package.json` mit `astro` 7.x. Falls eine CLI-Option abgelehnt wird, `npm create astro@latest -- --help` lesen und interaktiv das Template **minimal** und **TypeScript strict** wählen.

> Hinweis: Astro 7 ist neuer als das Trainingswissen. Bei API-Fehlern (Config, `astro:assets`, Env) erst die aktuelle Doku über context7 (`/withastro/docs`) prüfen und nicht raten.

- [ ] **Step 2: Scripts in `site/package.json` setzen** (die übrigen Felder bleiben, wie sie sind)

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "astro check && vitest run",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Astro-Konfiguration** – `site/astro.config.mjs`

```js
import { defineConfig } from 'astro/config';

// GitHub Actions sets SITE_URL / BASE_PATH from actions/configure-pages
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
});
```

`site/vitest.config.ts` (damit Vitest die Playwright-Dateien nicht einsammelt):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Base-Pfad-Helfer** – `site/src/lib/paths.ts`

```ts
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
```

- [ ] **Step 5: Statische Dateien kopieren bzw. laden**

```bash
cp ../brand/msg-logo.svg public/msg-logo.svg
mkdir -p public/dokumente
curl -sSfL -o public/dokumente/satzung.pdf "https://xn--msg-bersee-deb.de/wp-content/uploads/2023/01/Satzung.pdf"
curl -sSfL -o public/dokumente/platzordnung.pdf "https://xn--msg-bersee-deb.de/wp-content/uploads/2023/01/Platzordnung.pdf"
file public/dokumente/*.pdf
```
Expected: beide als `PDF document` erkannt. Alle Dateien aus dem Template-`public/` außer `favicon.svg` löschen.

`site/public/favicon.svg` mit einem Segelflieger im Logo-Blau überschreiben:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0090DA"/><path d="M6 24 L26 8 M11 13 L21 21" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>
```

- [ ] **Step 6: Globale Styles** – `site/src/styles/global.css`

```css
:root {
  --blue: #0090da;
  --blue-dark: #0072ad;
  --ink: #14212c;
  --ink-soft: #4d5c6a;
  --muted: #6b7a88;
  --surface: #f4f7fa;
  --line: #e6eaee;
  --green: #1f9d55;
  --yellow: #d69e00;
  --red: #d64545;
  --radius: 14px;
  --font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 84px; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: #fff; line-height: 1.55; overflow-x: hidden; }
img { max-width: 100%; height: auto; display: block; }
a { color: var(--blue-dark); }
h1, h2, h3 { line-height: 1.1; margin: 0; }
h2 { font-size: clamp(1.6rem, 4vw, 2.1rem); font-weight: 800; margin: .25rem 0 1.25rem; }
.container { width: min(1120px, 100% - 32px); margin-inline: auto; }
section { padding-block: clamp(40px, 7vw, 72px); }
.band { background: var(--surface); }
.eyebrow { font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--blue); margin: 0; }
.muted { color: var(--muted); font-size: .9rem; }
.card { background: #fff; border-radius: var(--radius); padding: 20px; }
.btn { display: inline-block; background: var(--blue); color: #fff; font-weight: 700; text-decoration: none; padding: .6rem 1.1rem; border-radius: 999px; }
.btn:hover { background: var(--blue-dark); }
.btn-lg { font-size: 1.05rem; padding: .8rem 1.4rem; }
.grid-2 { display: grid; gap: 20px; grid-template-columns: 1.2fr 1fr; }
@media (max-width: 760px) { .grid-2 { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Layout** – `site/src/layouts/Base.astro`

```astro
---
import '../styles/global.css';
import { withBase } from '../lib/paths';

interface Props {
  title: string;
  description: string;
}
const { title, description } = Astro.props;
---
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href={withBase('favicon.svg')} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 8: Kopfzeile** – `site/src/components/Header.astro`

```astro
---
import { withBase } from '../lib/paths';

const home = withBase('/');
const links = [
  ['#wetter', 'Wetter & Webcam'],
  ['#was-wir-machen', 'Was wir machen'],
  ['#flugplatz', 'Flugplatz'],
];
---
<header class="site-header">
  <div class="container inner">
    <a href={home} class="logo">
      <img src={withBase('msg-logo.svg')} alt="Modellsportgruppe Übersee e. V." width="102" height="56" />
    </a>
    <nav aria-label="Hauptmenü">
      <ul>
        {links.map(([hash, label]) => <li><a href={home + hash}>{label}</a></li>)}
      </ul>
      <a class="btn" href={home + '#mitmachen'}>Mitmachen</a>
    </nav>
  </div>
</header>

<style>
  .site-header { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid var(--line); }
  .inner { display: flex; align-items: center; justify-content: space-between; height: 76px; }
  .logo img { height: 56px; width: auto; }
  nav { display: flex; align-items: center; gap: 22px; }
  ul { display: flex; gap: 22px; list-style: none; margin: 0; padding: 0; }
  ul a { color: var(--ink); font-weight: 600; text-decoration: none; }
  ul a:hover { color: var(--blue); }
  @media (max-width: 760px) { ul { display: none; } }
</style>
```

- [ ] **Step 9: Fußzeile** – `site/src/components/Footer.astro`

```astro
---
import { withBase } from '../lib/paths';
---
<footer>
  <div class="container inner">
    <span>© {new Date().getFullYear()} Modellsportgruppe Übersee e. V.</span>
    <nav aria-label="Rechtliches">
      <a href={withBase('dokumente/satzung.pdf')}>Satzung</a>
      <a href={withBase('dokumente/platzordnung.pdf')}>Platzordnung</a>
      <a href={withBase('impressum')}>Impressum</a>
      <a href={withBase('datenschutz')}>Datenschutz</a>
    </nav>
  </div>
</footer>

<style>
  footer { border-top: 1px solid var(--line); font-size: .9rem; color: var(--muted); }
  .inner { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; padding-block: 20px; }
  nav { display: flex; flex-wrap: wrap; gap: 16px; }
  a { color: var(--muted); }
</style>
```

- [ ] **Step 10: Vorläufige Startseite** – `site/src/pages/index.astro`

```astro
---
import Base from '../layouts/Base.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
---
<Base title="MSG Übersee – Modellflug am Chiemsee" description="Modellsportgruppe Übersee e. V.: Modellflugplatz in Übersee-Luft. Live-Wetter, Webcam und wie du mitmachen kannst.">
  <Header />
  <main></main>
  <Footer />
</Base>
```

- [ ] **Step 11: Build prüfen**

Run: `cd site && npm run build && npx astro check`
Expected: Build erfolgreich, `dist/index.html` existiert, `astro check` meldet 0 Fehler.

- [ ] **Step 12: Pages-Workflow** – `.github/workflows/site.yml`

```yaml
name: Website

on:
  push:
    branches: [main]
    paths: ['site/**', 'brand/**', '.github/workflows/site.yml']
  pull_request:
    paths: ['site/**', '.github/workflows/site.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: site/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - id: pages
        if: github.event_name != 'pull_request'
        uses: actions/configure-pages@v5
      - if: github.event_name != 'pull_request'
        run: npm run build
        env:
          SITE_URL: ${{ steps.pages.outputs.origin }}
          BASE_PATH: ${{ steps.pages.outputs.base_path }}
          PUBLIC_RELAY_URL: ${{ vars.RELAY_URL }}
      - if: github.event_name != 'pull_request'
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    if: github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

(Der Schritt `test:e2e` greift erst ab Task 11. Bis dahin findet Playwright keine Tests und endet mit „No tests found“ und Exit-Code 1. Deshalb vor Task 11 nicht nach `main` pushen.)

- [ ] **Step 13: Commit**

```bash
git add site .github/workflows/site.yml
git commit -m "Scaffold Astro site with layout, header, footer and Pages deploy"
```

---

### Task 7: Vereinsdaten und Wetter-Logik

**Files:**
- Create: `site/src/data/verein.ts`, `site/src/lib/weather.ts`
- Test: `site/src/lib/weather.test.ts`

**Interfaces:**
- Produces:
  - `verein` (siehe Code). Felder: `name`, `ort`, `lage`, `koordinaten: {lat, lon} | null`, `whatsapp: {nummer, ansprechperson, text}`, `ampel: {gruenBisKmh, gelbBisKmh}`, `flugzeiten: {was, zeiten[]}[]`, `gutZuWissen: {icon, titel, text}[]`, `impressum: {...}`
  - `type Point`, `type WeatherResponse = { updated: string|null; current: Point|null; today: Point[]; stale: boolean }`, `type WebcamResponse = { images: {url: string; time: string}[]; stale: boolean }`
  - `ampel(windKmh: number, limits: {gruenBisKmh: number; gelbBisKmh: number}): { level: 'gruen'|'gelb'|'rot'; label: string }`
  - `formatClock(iso: string): string` gibt `"HH:MM"` zurück (Ortszeit aus dem ISO-String, nicht aus der Browser-Zeitzone).
  - `isOutdated(iso: string, nowMs: number, maxAgeMin?: number = 30): boolean`
  - `windBarsSvg(today: Point[], opts?: {width?: number; height?: number}): string` gibt HTML zurück: ein `<svg class="wind-bars">` mit einem `<rect>` pro Punkt plus eine `.axis`-Zeile. Bei leerer Liste kommt `<p class="muted">Heute noch keine Messwerte</p>`.

- [ ] **Step 1: Vereinsdaten** – `site/src/data/verein.ts`

```ts
// Alle Angaben des Vereins an einer Stelle. Direkt auf GitHub bearbeitbar.
// Offene Punkte sind mit TODO(Verein) markiert – leere Werte werden auf der Seite ausgeblendet.

export const verein = {
  name: 'Modellsportgruppe Übersee e. V.',
  ort: 'Übersee, Ortsteil Luft',
  lage: 'Der Platz liegt in Übersee im Ortsteil Luft, direkt an der Bahnlinie München–Salzburg.',

  // TODO(Verein): Koordinaten des Flugplatzes (Dezimalgrad), z. B. { lat: 47.81, lon: 12.48 }.
  // Solange null, wird keine Karte angezeigt.
  koordinaten: null as { lat: number; lon: number } | null,

  whatsapp: {
    // TODO(Verein): Handynummer international ohne + und Leerzeichen, z. B. '4915112345678'.
    // Solange leer, wird statt des Buttons ein neutraler Hinweis gezeigt.
    nummer: '',
    // TODO(Verein): Vorname der Ansprechperson, z. B. 'Christian'.
    ansprechperson: '',
    text: 'Hallo, ich interessiere mich für Modellflug bei der MSG Übersee und würde gern mal vorbeikommen.',
  },

  // TODO(Verein): Grenzwerte mit dem Vorstand abstimmen (km/h).
  ampel: { gruenBisKmh: 15, gelbBisKmh: 25 },

  flugzeiten: [
    { was: 'Elektromodelle', zeiten: ['Mo–So: Sonnenaufgang bis Sonnenuntergang'] },
    { was: 'Verbrennermodelle', zeiten: ['Mo–Sa: 10–12, 14–16 und 17:30–19 Uhr', 'So & Feiertag: 10–12 und 14–17:30 Uhr'] },
    { was: 'Verbrenner-Hubschrauber', zeiten: ['Mo–Fr: 10–12 und 14–15:30 Uhr', 'Sa: 10–12 Uhr', 'So: kein Flugbetrieb'] },
  ],

  gutZuWissen: [
    { icon: '👋', titel: 'Einfach vorbeikommen', text: 'Zuschauen und fachsimpeln geht immer – ohne Termin. Schau vorher auf die Webcam, ob jemand am Platz ist.' },
    // TODO(Verein): Lehrer-Schüler-Betrieb bestätigen
    { icon: '🎮', titel: 'Mitfliegen auf Anfrage', text: 'Am Lehrer-Schüler-Sender fliegst du zusammen mit einem erfahrenen Piloten. Sag Bescheid, dann organisieren wir das.' },
    { icon: '🛠️', titel: 'Hilfe beim ersten Modell', text: 'Kaufen oder selber bauen? Wir beraten dich – im Winter wird gemeinsam gebaut.' },
    // TODO(Verein): Beitragshöhe ergänzen, sobald bekannt
    { icon: '🪪', titel: 'Mitglied werden', text: 'Selbst fliegen darfst du auf dem Platz als Mitglied oder mit Erlaubnis des Vorstands. Den Beitrag nennen wir dir gern.' },
  ],

  impressum: {
    // TODO(Verein): ladungsfähige Vereinsanschrift bestätigen (bisher nur die des Verantwortlichen bekannt)
    anschrift: ['Lindenstraße 10', '83233 Bernau'],
    // TODO(Verein): Namen des vertretungsberechtigten Vorstands (1. und 2. Vorsitzende/r)
    vorstand: [] as string[],
    email: 'vorstand@msg-übersee.de',
    emailHref: 'mailto:vorstand@xn--msg-bersee-deb.de',
    registergericht: 'Amtsgericht Traunstein',
    registernummer: 'VR 1083',
    verantwortlich: { name: 'Stefan Ueing', anschrift: ['Lindenstraße 10', '83233 Bernau'] },
  },
};
```

- [ ] **Step 2: Failing tests schreiben** – `site/src/lib/weather.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import { ampel, formatClock, isOutdated, windBarsSvg, type Point } from './weather';

const limits = { gruenBisKmh: 15, gelbBisKmh: 25 };
const point = (time: string, windKmh: number): Point => ({
  time: `2026-10-15T${time}:00+02:00`, windDir: 'SW', windDeg: 224, windKmh, tempC: 14, pressureHpa: 1030,
});

describe('ampel', () => {
  test.each([
    [0, 'gruen', 'Gutes Flugwetter'],
    [14.9, 'gruen', 'Gutes Flugwetter'],
    [15, 'gelb', 'Böig – nur für Erfahrene'],
    [25, 'gelb', 'Böig – nur für Erfahrene'],
    [25.1, 'rot', 'Zu windig'],
  ])('%s km/h -> %s', (kmh, level, label) => {
    expect(ampel(kmh, limits)).toEqual({ level, label });
  });
});

test('formatClock uses the station-local time from the ISO string', () => {
  expect(formatClock('2026-10-15T20:40:00+02:00')).toBe('20:40');
  expect(formatClock('2026-01-15T07:05:00+01:00')).toBe('07:05');
});

test('isOutdated after 30 minutes', () => {
  const now = Date.parse('2026-10-15T21:00:00+02:00');
  expect(isOutdated('2026-10-15T20:31:00+02:00', now)).toBe(false);
  expect(isOutdated('2026-10-15T20:29:00+02:00', now)).toBe(true);
  expect(isOutdated('2026-10-15T20:50:00+02:00', now, 5)).toBe(true);
});

describe('windBarsSvg', () => {
  test('one bar per measurement, peak in label, axis with first/last time', () => {
    const html = windBarsSvg([point('00:01', 2), point('12:00', 30), point('20:40', 0)]);
    expect(html.match(/<rect /g)).toHaveLength(3);
    expect(html).toContain('aria-label="Windverlauf heute, höchstens 30 km/h"');
    expect(html).toContain('<span>00:01</span><span>20:40</span>');
  });

  test('calm wind still renders a visible bar', () => {
    const html = windBarsSvg([point('10:00', 0)], { width: 100, height: 90 });
    const height = Number(/height="([\d.]+)"><title>/.exec(html)?.[1]);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  test('no data gives a friendly message instead of an empty chart', () => {
    expect(windBarsSvg([])).toBe('<p class="muted">Heute noch keine Messwerte</p>');
  });
});
```

- [ ] **Step 3: Tests laufen lassen, müssen fehlschlagen**

Run: `cd site && npx vitest run`
Expected: FAIL mit `Failed to resolve import "./weather"`

- [ ] **Step 4: Implementieren** – `site/src/lib/weather.ts`

```ts
export type Point = {
  time: string;
  windDir: string;
  windDeg: number;
  windKmh: number;
  tempC: number;
  pressureHpa: number;
};
export type WeatherResponse = { updated: string | null; current: Point | null; today: Point[]; stale: boolean };
export type WebcamResponse = { images: { url: string; time: string }[]; stale: boolean };
export type Ampel = { level: 'gruen' | 'gelb' | 'rot'; label: string };

export function ampel(windKmh: number, limits: { gruenBisKmh: number; gelbBisKmh: number }): Ampel {
  if (windKmh < limits.gruenBisKmh) return { level: 'gruen', label: 'Gutes Flugwetter' };
  if (windKmh <= limits.gelbBisKmh) return { level: 'gelb', label: 'Böig – nur für Erfahrene' };
  return { level: 'rot', label: 'Zu windig' };
}

// The relay sends station-local time with offset; show that wall-clock time, not the browser's.
export function formatClock(iso: string): string {
  return iso.slice(11, 16);
}

export function isOutdated(iso: string, nowMs: number, maxAgeMin = 30): boolean {
  return nowMs - Date.parse(iso) > maxAgeMin * 60_000;
}

export function windBarsSvg(today: Point[], { width = 480, height = 90 } = {}): string {
  if (today.length === 0) return '<p class="muted">Heute noch keine Messwerte</p>';
  const peak = Math.max(...today.map((p) => p.windKmh));
  const scale = Math.max(20, peak);
  const slot = width / today.length;
  const bars = today
    .map((p, i) => {
      const h = Math.max(1, (p.windKmh / scale) * height);
      return `<rect x="${(i * slot).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${Math.max(0.5, slot - 1).toFixed(1)}" height="${h.toFixed(1)}"><title>${formatClock(p.time)} · ${p.windKmh} km/h</title></rect>`;
    })
    .join('');
  return (
    `<svg class="wind-bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Windverlauf heute, höchstens ${peak} km/h">${bars}</svg>` +
    `<div class="axis"><span>${formatClock(today[0].time)}</span><span>${formatClock(today[today.length - 1].time)}</span></div>`
  );
}
```

- [ ] **Step 5: Tests laufen lassen, müssen grün sein**

Run: `cd site && npm test`
Expected: `astro check` mit 0 Fehlern, Vitest PASS (10 Tests)

- [ ] **Step 6: Commit**

```bash
git add site/src/data/verein.ts site/src/lib/weather.ts site/src/lib/weather.test.ts
git commit -m "Add club data file and weather helpers (traffic light, wind bars)"
```

---

### Task 8: Statische Abschnitte der Startseite

**Files:**
- Create: `site/src/assets/photos/{flugplatz.jpeg,drohne.jpg,panorama.jpg,drachen.jpeg}`, `site/src/components/{Hero,LiveTile,WeatherSection,Polaroid,WhatWeDo,GoodToKnow,Airfield,JoinCta}.astro`
- Modify: `site/src/pages/index.astro`

**Interfaces:**
- Consumes: `verein` (Task 7), `withBase` (Task 6), CSS-Klassen aus `global.css`
- Produces: DOM-Hooks, die `live.ts` in Task 9 verwendet (exakt so benennen):
  - `img[data-live="hero"]`: Hero-Bild
  - `[data-live="wind"]`, `[data-live="dir"]`, `[data-live="temp"]`, `[data-live="pressure"]`, `[data-live="time"]`: Textfelder, Wert `–` bis Daten da sind
  - `[data-live="status"]` mit Attribut `data-level` = `off|gruen|gelb|rot`
  - `[data-live="bars"]`: Container für `windBarsSvg()`
  - `[data-live="thumbs"]`: Container für die Webcam-Vorschaubilder
  - `img[data-refresh-src]`: Bilder vom alten Server, die beim Aktualisieren einen Cache-Buster bekommen
  - Anker-IDs: `wetter`, `was-wir-machen`, `flugplatz`, `mitmachen`

- [ ] **Step 1: Fotos von der alten Seite laden**

```bash
cd site && mkdir -p src/assets/photos
U=https://xn--msg-bersee-deb.de/wp-content/uploads
curl -sSfL -o src/assets/photos/flugplatz.jpeg "$U/2022/12/cropped-IMG_2779-scaled-1.jpeg"
curl -sSfL -o src/assets/photos/drohne.jpg "$U/2023/01/DJI_0846-1024x576.jpg"
curl -sSfL -o src/assets/photos/panorama.jpg "$U/2023/01/cropped-DJI_0841-scaled-1-1024x341.jpg"
curl -sSfL -o src/assets/photos/drachen.jpeg "$U/2023/01/IMG_3954-2-1024x768.jpeg"
file src/assets/photos/*
```
Expected: alle vier als `JPEG image data` erkannt

- [ ] **Step 2: Live-Kachel** – `site/src/components/LiveTile.astro`

```astro
<div class="tile" aria-live="polite">
  <p class="eyebrow">Live vom Platz <span data-live="time"></span></p>
  <p class="values">
    <span><b data-live="wind">–</b> <small>km/h <span data-live="dir"></span></small></span>
    <span><b data-live="temp">–</b><small> °C</small></span>
  </p>
  <p class="status" data-live="status" data-level="off">Lade Wetterdaten …</p>
</div>

<style>
  .tile { background: rgba(255, 255, 255, .96); color: var(--ink); border-radius: var(--radius); padding: 14px 18px; min-width: 240px; }
  .values { display: flex; gap: 20px; align-items: baseline; margin: 6px 0 4px; }
  b { font-size: 2rem; font-weight: 800; }
  .status { margin: 0; font-weight: 600; font-size: .95rem; }
  .status::before { content: ''; display: inline-block; width: .7em; height: .7em; border-radius: 50%; margin-right: .45em; background: var(--muted); }
  .status[data-level='gruen']::before { background: var(--green); }
  .status[data-level='gelb']::before { background: var(--yellow); }
  .status[data-level='rot']::before { background: var(--red); }
</style>
```

- [ ] **Step 3: Hero** – `site/src/components/Hero.astro`

```astro
---
import { Image } from 'astro:assets';
import panorama from '../assets/photos/panorama.jpg';
import LiveTile from './LiveTile.astro';
---
<section class="hero">
  <Image src={panorama} alt="Der Flugplatz der MSG Übersee von oben" data-live="hero" class="hero-img" loading="eager" />
  <div class="shade"></div>
  <div class="container content">
    <div>
      <h1>Selber fliegen.<br />Am Chiemsee.</h1>
      <p class="lead">Modellflug in Übersee – komm einfach vorbei.</p>
      <a class="btn btn-lg" href="#flugplatz">So kommst du zu uns →</a>
    </div>
    <LiveTile />
  </div>
</section>

<style>
  .hero { position: relative; min-height: min(78vh, 560px); display: flex; align-items: flex-end; padding: 0; overflow: hidden; color: #fff; }
  .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0, 40, 70, 0) 30%, rgba(0, 40, 70, .82)); }
  .content { position: relative; display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between; align-items: flex-end; padding-block: 32px; }
  h1 { font-size: clamp(2.2rem, 7vw, 3.4rem); font-weight: 800; }
  .lead { font-size: 1.1rem; opacity: .92; margin: 10px 0 18px; }
</style>
```

- [ ] **Step 4: Wetterbereich** – `site/src/components/WeatherSection.astro`

```astro
---
const station = 'https://xn--msg-bersee-deb.de/Programme/';
---
<section id="wetter" class="band">
  <div class="container">
    <p class="eyebrow">Wetter &amp; Webcam</p>
    <h2>Wie sieht es gerade am Platz aus?</h2>
    <div class="grid-2">
      <article class="card">
        <h3>Wind heute <small class="muted">(alle 10 Min.)</small></h3>
        <div class="bars" data-live="bars"><p class="muted">Lade Messwerte …</p></div>
        <dl>
          <div><dt>Temperatur</dt><dd><span data-live="temp">–</span> °C</dd></div>
          <div><dt>Luftdruck</dt><dd><span data-live="pressure">–</span> hPa</dd></div>
          <div><dt>Windrichtung</dt><dd><span data-live="dir">–</span></dd></div>
        </dl>
      </article>
      <article class="card">
        <h3>Webcam – die letzten Stunden</h3>
        <div class="thumbs" data-live="thumbs"><p class="muted">Lade Webcam …</p></div>
        <p class="muted">Tipp: Stehen Autos am Platz, fliegt meistens jemand.</p>
      </article>
    </div>
    <details>
      <summary>Diagramme der Wetterstation</summary>
      <div class="charts">
        <img src={`${station}wind.jpg`} data-refresh-src={`${station}wind.jpg`} alt="Windgeschwindigkeit heute (Diagramm der Wetterstation)" loading="lazy" />
        <img src={`${station}windrose_db_msg1.php`} data-refresh-src={`${station}windrose_db_msg1.php`} alt="Windrose heute" loading="lazy" />
      </div>
    </details>
  </div>
</section>

<style>
  h3 { font-size: 1.05rem; margin-bottom: 12px; }
  .bars { min-height: 110px; }
  .bars :global(.wind-bars) { width: 100%; height: 90px; fill: var(--blue); }
  .bars :global(.axis) { display: flex; justify-content: space-between; font-size: .75rem; color: var(--muted); }
  dl { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 14px 0 0; }
  dt { font-size: .8rem; color: var(--muted); }
  dd { margin: 0; font-weight: 700; }
  .thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; min-height: 140px; }
  .thumbs :global(figure) { margin: 0; position: relative; }
  .thumbs :global(img) { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; }
  .thumbs :global(figcaption) { position: absolute; left: 4px; bottom: 4px; font-size: .7rem; background: rgba(0, 0, 0, .55); color: #fff; padding: 0 4px; border-radius: 3px; }
  details { margin-top: 18px; }
  summary { cursor: pointer; font-weight: 600; color: var(--blue-dark); }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 12px; }
  .charts img { background: #fff; border-radius: 8px; }
</style>
```

- [ ] **Step 5: Polaroid und „Was wir machen“**

`site/src/components/Polaroid.astro`:

```astro
---
import { Image } from 'astro:assets';
import type { ImageMetadata } from 'astro';

interface Props {
  src: ImageMetadata;
  alt: string;
  caption: string;
  tilt?: number;
}
const { src, alt, caption, tilt = 0 } = Astro.props;
---
<figure class="polaroid" style={`--tilt: ${tilt}deg`}>
  <Image src={src} alt={alt} widths={[320, 640]} sizes="(max-width: 760px) 90vw, 30vw" />
  <figcaption>{caption}</figcaption>
</figure>

<style>
  .polaroid { margin: 0; background: #fff; padding: 10px 10px 0; box-shadow: 0 8px 22px rgba(0, 0, 0, .14); transform: rotate(var(--tilt)); }
  .polaroid :global(img) { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
  figcaption { padding: 10px 2px 14px; font-weight: 600; }
</style>
```

`site/src/components/WhatWeDo.astro`:

```astro
---
import Polaroid from './Polaroid.astro';
import flugplatz from '../assets/photos/flugplatz.jpeg';
import drohne from '../assets/photos/drohne.jpg';
import drachen from '../assets/photos/drachen.jpeg';
---
<section id="was-wir-machen">
  <div class="container">
    <p class="eyebrow">Was wir machen</p>
    <h2>Bauen, fliegen, fachsimpeln.</h2>
    <p class="intro">
      Flugzeuge, Segler, Hubschrauber – aber auch Autos und Schiffe. Im Sommer sind wir am Platz,
      im Winter wird gebaut. Bei uns findest du Leute mit jahrzehntelanger Erfahrung, die gern helfen.
    </p>
    <div class="photos">
      <Polaroid src={flugplatz} alt="Modellflugplatz in Übersee-Luft" caption="Unser Flugplatz" tilt={-2.5} />
      <Polaroid src={drohne} alt="Der Flugplatz aus der Luft fotografiert" caption="Von oben" tilt={1.8} />
      <Polaroid src={drachen} alt="Drachen am Himmel über dem Platz" caption="Zu windig? Dann Drachen." tilt={-1.2} />
    </div>
  </div>
</section>

<style>
  .intro { color: var(--ink-soft); max-width: 640px; margin: -8px 0 30px; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; padding-inline: 6px; }
  @media (max-width: 760px) { .photos { grid-template-columns: 1fr; max-width: 360px; margin-inline: auto; } }
</style>
```

- [ ] **Step 6: Gut zu wissen** – `site/src/components/GoodToKnow.astro`

```astro
---
import { verein } from '../data/verein';
---
<section class="band">
  <div class="container">
    <p class="eyebrow">Gut zu wissen</p>
    <h2>Kein Vorwissen nötig – wir helfen dir.</h2>
    <ul>
      {verein.gutZuWissen.map((k) => (
        <li class="card">
          <span class="icon" aria-hidden="true">{k.icon}</span>
          <h3>{k.titel}</h3>
          <p>{k.text}</p>
        </li>
      ))}
    </ul>
  </div>
</section>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .icon { font-size: 1.7rem; }
  h3 { font-size: 1.05rem; margin: 8px 0 6px; }
  p { margin: 0; color: var(--ink-soft); font-size: .95rem; }
</style>
```

- [ ] **Step 7: Flugplatz** – `site/src/components/Airfield.astro`

```astro
---
import { verein } from '../data/verein';
import { withBase } from '../lib/paths';

const k = verein.koordinaten;
const routeUrl = k
  ? `https://www.openstreetmap.org/directions?to=${k.lat}%2C${k.lon}`
  : `https://www.openstreetmap.org/search?query=${encodeURIComponent('Übersee Luft')}`;
const mapUrl = k
  ? `https://www.openstreetmap.org/export/embed.html?bbox=${k.lon - 0.012}%2C${k.lat - 0.006}%2C${k.lon + 0.012}%2C${k.lat + 0.006}&layer=mapnik&marker=${k.lat}%2C${k.lon}`
  : null;
---
<section id="flugplatz">
  <div class="container grid-2">
    <div>
      <p class="eyebrow">Der Flugplatz</p>
      <h2>{verein.ort}</h2>
      <p>{verein.lage}</p>
      {mapUrl && <iframe class="map" src={mapUrl} title="Karte zum Flugplatz" loading="lazy"></iframe>}
      <a class="btn" href={routeUrl} rel="noopener">Route planen</a>
    </div>
    <div class="card times">
      <h3>Flugzeiten</h3>
      <dl>
        {verein.flugzeiten.map((f) => (
          <div>
            <dt>{f.was}</dt>
            {f.zeiten.map((z) => <dd>{z}</dd>)}
          </div>
        ))}
      </dl>
      <p class="muted">Fliegen dürfen Mitglieder und Gäste mit Erlaubnis des Vorstands. Zuschauen darf jeder.
        Details in der <a href={withBase('dokumente/platzordnung.pdf')}>Platzordnung (PDF)</a>.</p>
    </div>
  </div>
</section>

<style>
  .map { width: 100%; height: 240px; border: 0; border-radius: var(--radius); margin: 8px 0 16px; }
  .times { background: var(--surface); }
  h3 { margin-bottom: 10px; }
  dl { margin: 0 0 12px; display: grid; gap: 12px; }
  dt { font-weight: 700; }
  dd { margin: 0; color: var(--ink-soft); }
</style>
```

- [ ] **Step 8: Mitmachen** – `site/src/components/JoinCta.astro`

```astro
---
import { verein } from '../data/verein';

const { nummer, ansprechperson, text } = verein.whatsapp;
const href = nummer ? `https://wa.me/${nummer}?text=${encodeURIComponent(text)}` : null;
---
<section id="mitmachen">
  <div class="container">
    <div class="box">
      <p class="eyebrow">Mitmachen</p>
      <h2>Lust bekommen?</h2>
      <p>Schreib {ansprechperson || 'uns'} einfach auf WhatsApp – wir sagen dir, wann jemand am Platz ist.</p>
      {href
        ? <a class="wa" href={href} rel="noopener">💬 Auf WhatsApp schreiben</a>
        : <p class="soon">Komm einfach am Platz vorbei – ein Kontakt per WhatsApp folgt in Kürze.</p>}
    </div>
  </div>
</section>

<style>
  .box { background: var(--ink); color: #fff; border-radius: 18px; padding: clamp(24px, 5vw, 44px); }
  .eyebrow { color: #6cc4f2; }
  h2 { margin-bottom: 10px; }
  p { opacity: .9; max-width: 560px; }
  .wa { display: inline-block; margin-top: 10px; background: #25d366; color: #06301a; font-weight: 800; text-decoration: none; padding: .8rem 1.3rem; border-radius: 999px; }
  .soon { font-weight: 600; }
</style>
```

- [ ] **Step 9: Startseite zusammensetzen** – `site/src/pages/index.astro` komplett ersetzen

```astro
---
import Base from '../layouts/Base.astro';
import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
import WeatherSection from '../components/WeatherSection.astro';
import WhatWeDo from '../components/WhatWeDo.astro';
import GoodToKnow from '../components/GoodToKnow.astro';
import Airfield from '../components/Airfield.astro';
import JoinCta from '../components/JoinCta.astro';
import Footer from '../components/Footer.astro';
---
<Base title="MSG Übersee – Modellflug am Chiemsee" description="Modellsportgruppe Übersee e. V.: Modellflugplatz in Übersee-Luft. Live-Wetter, Webcam und wie du mitmachen kannst.">
  <Header />
  <main>
    <Hero />
    <WeatherSection />
    <WhatWeDo />
    <GoodToKnow />
    <Airfield />
    <JoinCta />
  </main>
  <Footer />
</Base>
```

- [ ] **Step 10: Build und Sichtprüfung**

Run: `cd site && npm test && npm run build && npm run preview`
Expected: `npm test` grün, Build erfolgreich. Unter `http://localhost:4321` die Startseite bei Desktop-Breite und bei 375 px (DevTools) ansehen. Alle Abschnitte sind sichtbar, „Lade Wetterdaten …“ steht in der Kachel (es gibt noch kein Skript), es gibt kein horizontales Scrollen, und nirgends steht „TODO“ (`grep -ri todo dist/` liefert keine Treffer).

- [ ] **Step 11: Commit**

```bash
git add site/src
git commit -m "Build homepage sections: hero, weather, photos, info, airfield, join"
```

---

### Task 9: Live-Daten im Browser

**Files:**
- Create: `site/src/scripts/live.ts`
- Modify: `site/src/pages/index.astro` (Skript einbinden)

**Interfaces:**
- Consumes: `ampel`, `formatClock`, `isOutdated`, `windBarsSvg`, `WeatherResponse`, `WebcamResponse` (Task 7), `verein.ampel` (Task 7), DOM-Hooks aus Task 8, Build-Variable `PUBLIC_RELAY_URL`
- Produces: Textzustände, die Task 10 prüft:
  - Kein Relay oder Fehler: Status „Wetterdaten gerade nicht verfügbar“, Bars „Messwerte gerade nicht verfügbar“, Thumbs „Webcam gerade nicht verfügbar“
  - `stale` oder Wert älter als 30 Min.: Status „Letzter Messwert von HH:MM Uhr“, `data-level="off"`
  - Frisch: Status aus `ampel()`, `data-level` = Ampel-Level

- [ ] **Step 1: Skript schreiben** – `site/src/scripts/live.ts`

```ts
import { verein } from '../data/verein';
import { ampel, formatClock, isOutdated, windBarsSvg, type WeatherResponse, type WebcamResponse } from '../lib/weather';

const RELAY = (import.meta.env.PUBLIC_RELAY_URL ?? '').replace(/\/$/, '');
const REFRESH_MS = 5 * 60 * 1000;

function all<T extends Element = HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}

function setText(name: string, text: string) {
  for (const el of all(`[data-live="${name}"]`)) el.textContent = text;
}

function setStatus(level: string, text: string) {
  for (const el of all('[data-live="status"]')) {
    el.dataset.level = level;
    el.textContent = text;
  }
}

function setMessage(name: string, text: string) {
  for (const el of all(`[data-live="${name}"]`)) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    el.replaceChildren(p);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(RELAY + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function renderWeather(w: WeatherResponse) {
  for (const el of all('[data-live="bars"]')) el.innerHTML = windBarsSvg(w.today);
  const c = w.current;
  if (!c) {
    setStatus('off', 'Heute noch keine Messwerte');
    return;
  }
  setText('wind', String(c.windKmh));
  setText('dir', c.windDir);
  setText('temp', String(c.tempC));
  setText('pressure', String(c.pressureHpa));
  if (w.stale || isOutdated(c.time, Date.now())) {
    setText('time', `· Stand ${formatClock(c.time)}`);
    setStatus('off', `Letzter Messwert von ${formatClock(c.time)} Uhr`);
  } else {
    setText('time', `· ${formatClock(c.time)}`);
    const a = ampel(c.windKmh, verein.ampel);
    setStatus(a.level, a.label);
  }
}

function renderWebcam(w: WebcamResponse) {
  const latest = w.images[0];
  const hero = document.querySelector<HTMLImageElement>('img[data-live="hero"]');
  if (hero && latest && hero.dataset.current !== latest.url) {
    const probe = new Image();
    probe.onload = () => {
      hero.removeAttribute('srcset');
      hero.removeAttribute('sizes');
      hero.src = latest.url;
      hero.alt = `Webcam am Flugplatz, ${formatClock(latest.time)} Uhr`;
      hero.dataset.current = latest.url;
    };
    probe.src = latest.url;
  }
  for (const box of all('[data-live="thumbs"]')) {
    box.replaceChildren(
      ...w.images.slice(0, 6).map((image) => {
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = `Webcam ${formatClock(image.time)} Uhr`;
        img.loading = 'lazy';
        const cap = document.createElement('figcaption');
        cap.textContent = formatClock(image.time);
        fig.append(img, cap);
        return fig;
      }),
    );
  }
}

function refreshStationImages() {
  for (const img of all<HTMLImageElement>('img[data-refresh-src]')) {
    img.src = `${img.dataset.refreshSrc}?t=${Date.now()}`;
  }
}

async function refresh() {
  refreshStationImages();
  const [weather, webcam] = RELAY
    ? await Promise.allSettled([getJson<WeatherResponse>('/weather'), getJson<WebcamResponse>('/webcam')])
    : [{ status: 'rejected' as const }, { status: 'rejected' as const }];
  if (weather.status === 'fulfilled') {
    renderWeather(weather.value);
  } else {
    setStatus('off', 'Wetterdaten gerade nicht verfügbar');
    setMessage('bars', 'Messwerte gerade nicht verfügbar');
  }
  if (webcam.status === 'fulfilled') renderWebcam(webcam.value);
  else setMessage('thumbs', 'Webcam gerade nicht verfügbar');
}

refresh();
setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
```

- [ ] **Step 2: Skript einbinden.** In `site/src/pages/index.astro` direkt vor `</Base>` einfügen:

```astro
  <script>
    import '../scripts/live.ts';
  </script>
```

- [ ] **Step 3: Gegen ein lokales Relay testen**

Run (zwei Shells):
```bash
# Shell 1
cd relay && ALLOWED_ORIGINS=http://localhost:4321 PORT=8089 npm start
# Shell 2
cd site && PUBLIC_RELAY_URL=http://localhost:8089 npm run build && npm run preview
```
Expected: Unter `http://localhost:4321` zeigt die Kachel echte Werte, eine Uhrzeit und die Ampel. Das Hero-Bild wechselt zum neuesten Webcam-Bild, der Windverlauf ist als Balken zu sehen, es gibt 6 Vorschaubilder und die Browser-Konsole ist ohne Fehler. Danach Shell 1 stoppen und die Seite neu laden: Die Kachel zeigt „Wetterdaten gerade nicht verfügbar“, das Panorama-Foto bleibt stehen.

- [ ] **Step 4: Typprüfung**

Run: `cd site && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add site/src/scripts/live.ts site/src/pages/index.astro
git commit -m "Load live weather and webcam from relay with graceful fallback"
```

---

### Task 10: Impressum und Datenschutz

**Files:**
- Create: `site/src/pages/impressum.astro`, `site/src/pages/datenschutz.astro`, `site/src/layouts/Legal.astro`

**Interfaces:**
- Consumes: `Base`, `Header`, `Footer` (Task 6), `verein.impressum` (Task 7)

- [ ] **Step 1: Layout für Rechtstexte** – `site/src/layouts/Legal.astro`

```astro
---
import Base from './Base.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title: string;
}
const { title } = Astro.props;
---
<Base title={`${title} – MSG Übersee`} description={`${title} der Modellsportgruppe Übersee e. V.`}>
  <Header />
  <main class="container legal">
    <h1>{title}</h1>
    <slot />
  </main>
  <Footer />
</Base>

<style>
  .legal { max-width: 760px; padding-block: 48px; }
  h1 { font-size: 2rem; margin-bottom: 24px; }
  .legal :global(h2) { font-size: 1.2rem; margin: 28px 0 8px; }
</style>
```

- [ ] **Step 2: Impressum** – `site/src/pages/impressum.astro`

```astro
---
import Legal from '../layouts/Legal.astro';
import { verein } from '../data/verein';

const i = verein.impressum;
---
<Legal title="Impressum">
  <h2>Angaben gemäß § 5 DDG</h2>
  <p>
    {verein.name}<br />
    {i.anschrift.map((zeile) => <>{zeile}<br /></>)}
  </p>
  <p>
    Vertreten durch den Vorstand{i.vorstand.length > 0 && <>: {i.vorstand.join(', ')}</>}.
  </p>
  <h2>Registereintrag</h2>
  <p>Eingetragen im Vereinsregister.<br />Registergericht: {i.registergericht}<br />Registernummer: {i.registernummer}</p>
  <h2>Kontakt</h2>
  <p>E-Mail: <a href={i.emailHref}>{i.email}</a></p>
  <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
  <p>
    {i.verantwortlich.name}<br />
    {i.verantwortlich.anschrift.map((zeile) => <>{zeile}<br /></>)}
  </p>
</Legal>
```

- [ ] **Step 3: Datenschutz** – `site/src/pages/datenschutz.astro`

```astro
---
import Legal from '../layouts/Legal.astro';
import { verein } from '../data/verein';

const i = verein.impressum;
---
<Legal title="Datenschutz">
  <p>Wir freuen uns über deinen Besuch. Diese Website kommt ohne Cookies, ohne Tracking und ohne Werbung aus.
    Hier erklären wir, welche Daten beim Aufruf trotzdem technisch bedingt verarbeitet werden.</p>

  <h2>Verantwortlicher</h2>
  <p>{verein.name}<br />{i.anschrift.map((zeile) => <>{zeile}<br /></>)}E-Mail: <a href={i.emailHref}>{i.email}</a></p>

  <h2>Hosting der Website</h2>
  <p>Die Website wird über GitHub Pages bereitgestellt (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA).
    Beim Aufruf verarbeitet GitHub deine IP-Adresse sowie technische Angaben wie Browsertyp und Zeitpunkt, um die Seite auszuliefern
    und vor Missbrauch zu schützen. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und zuverlässigen
    Bereitstellung (Art. 6 Abs. 1 lit. f DSGVO). GitHub ist unter dem EU-US Data Privacy Framework zertifiziert.
    Weitere Informationen: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">Datenschutzerklärung von GitHub</a>.</p>

  <h2>Wetterdaten und Webcam</h2>
  <p>Aktuelle Wetterwerte und Webcam-Bilder vom Flugplatz lädt dein Browser von einem vom Verein betriebenen Server sowie direkt
    vom Webspace unserer Wetterstation (msg-übersee.de). Dabei wird technisch bedingt deine IP-Adresse an diese Server übermittelt.
    Es werden keine Cookies gesetzt und keine Nutzungsprofile erstellt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
    (Anzeige der Live-Informationen). Die Webcam ist auf den Flugplatz gerichtet; Personen sind darauf nicht erkennbar.</p>

  {verein.koordinaten && (
    <>
      <h2>Karte (OpenStreetMap)</h2>
      <p>Zur Anfahrt binden wir eine Karte von OpenStreetMap ein (OpenStreetMap Foundation, St John’s Innovation Centre,
        Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich). Beim Laden der Karte wird deine IP-Adresse an die
        OpenStreetMap Foundation übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
        Weitere Informationen: <a href="https://osmfoundation.org/wiki/Privacy_Policy" rel="noopener">Datenschutzerklärung der OSMF</a>.</p>
    </>
  )}

  <h2>Kontakt über WhatsApp</h2>
  <p>Der WhatsApp-Button ist ein einfacher Link. Erst wenn du ihn anklickst, wirst du zu WhatsApp (WhatsApp Ireland Limited,
    Merrion Road, Dublin 4, Irland) weitergeleitet. Dort gelten die Datenschutzbestimmungen von WhatsApp. Die Nachricht, die du uns
    schickst, nutzen wir nur, um dir zu antworten (Art. 6 Abs. 1 lit. b bzw. f DSGVO).</p>

  <h2>Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung, auf Datenübertragbarkeit sowie
    auf Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Wende dich dazu an die oben genannte
    E-Mail-Adresse. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, in Bayern beim Bayerischen
    Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.</p>
</Legal>
```

- [ ] **Step 4: Build prüfen**

Run: `cd site && npm test && npm run build && ls dist/impressum dist/datenschutz`
Expected: Beide Verzeichnisse enthalten `index.html`. `grep -ri todo dist/` liefert keine Treffer.

- [ ] **Step 5: Commit**

```bash
git add site/src/layouts/Legal.astro site/src/pages/impressum.astro site/src/pages/datenschutz.astro
git commit -m "Add Impressum and Datenschutz pages"
```

---

### Task 11: Playwright-Smoke-Tests (Relay ok, Relay weg, veraltet, Handy)

**Files:**
- Create: `site/playwright.config.ts`, `site/tests/home.spec.ts`

**Interfaces:**
- Consumes: DOM-Hooks und Texte aus Task 8 und Task 9
- Produces: `npm run test:e2e` (läuft in der CI aus Task 6)

- [ ] **Step 1: Konfiguration** – `site/playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  use: { baseURL: 'http://127.0.0.1:4329' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4329',
    url: 'http://127.0.0.1:4329',
    env: { PUBLIC_RELAY_URL: 'https://relay.test', BASE_PATH: '/' },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
```

- [ ] **Step 2: Tests schreiben** – `site/tests/home.spec.ts`

```ts
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
```

- [ ] **Step 3: Browser installieren und Tests laufen lassen**

Run: `cd site && npx playwright install chromium && npm run test:e2e`
Expected: 6 passed. Wenn ein Test fehlschlägt, zuerst mit `npx playwright test --headed` oder dem HTML-Report die Ursache finden (Selektor, Text, Timing) und die Ursache beheben. Erwartete Texte nicht an falsches Verhalten anpassen.

- [ ] **Step 4: Gesamtlauf**

Run: `cd relay && npm test && cd ../site && npm test && npm run test:e2e`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add site/playwright.config.ts site/tests/home.spec.ts
git commit -m "Add Playwright smoke tests for live, fallback, stale and mobile"
```

---

## Nach der Umsetzung (manuell, mit dem Nutzer)

1. GitHub-Repo anlegen, Remote setzen und pushen (`main`). Unter *Settings → Pages → Source* „GitHub Actions“ wählen.
2. Relay auf dem Docker-Host starten (siehe `relay/README.md`). Als `ALLOWED_ORIGINS` die github.io-Origin setzen, den Reverse Proxy einrichten und die HTTPS-URL als Repo-Variable `RELAY_URL` eintragen. Danach den Website-Workflow neu starten.
3. Offene Punkte aus `verein.ts` (`TODO(Verein)`) mit dem Vorstand klären: WhatsApp, Ansprechperson, Koordinaten, Beitrag, Vorstand, Anschrift, Ampel-Grenzwerte. Impressum und Datenschutz prüfen lassen.
