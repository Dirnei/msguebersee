import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const BASE = 'https://xn--msg-bersee-deb.de/Programme/';
const ORIGIN = 'https://verein.github.io';
const FORECAST = 'https://forecast.test/v1/forecast';

async function start(fetchText) {
  const config = {
    port: 0, upstreamBase: BASE, allowedOrigins: [ORIGIN], cacheMs: 300_000,
    forecastBase: FORECAST, lat: 47.822016, lon: 12.463561, forecastCacheMs: 1_800_000,
  };
  const server = createServer(createApp({ config, fetchText }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

const upstream = async (u) => {
  if (u === `${BASE}auslesen_tabelle.php`) return fixture('auslesen_tabelle.html');
  if (u === `${BASE}Bildtest-email.php`) return fixture('bildtest_email.html');
  if (u.startsWith(`${FORECAST}?`)) return fixture('open-meteo.json');
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

test('HEAD behaves like GET (reverse proxies, uptime checks)', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const res = await fetch(`${s.url}/webcam/latest.jpg`, { method: 'HEAD', redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal((await fetch(`${s.url}/health`, { method: 'HEAD' })).status, 200);
});

test('malformed request target does not crash the relay', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const port = new URL(s.url).port;
  const raw = await new Promise((resolve, reject) => {
    const request = ['GET //[ HTTP/1.1', 'Host: x', 'Connection: close', '', ''].join('\r\n');
    const socket = connect(port, '127.0.0.1', () => socket.end(request));
    let data = '';
    socket.on('data', (d) => { data += d; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  assert.match(raw, /^HTTP\/1\.1 404/);
  assert.equal(await (await fetch(`${s.url}/health`)).text(), 'ok');
});

test('GET /forecast returns hourly forecast with source and CORS', async (t) => {
  const s = await start(upstream);
  t.after(s.close);
  const res = await fetch(`${s.url}/forecast`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await res.json();
  assert.equal(body.source, 'Open-Meteo.com');
  assert.equal(body.stale, false);
  assert.equal(body.hours.length, 24);
  assert.equal(body.hours[0].time, '2026-10-16T00:00:00+02:00');
});

test('forecast service down gives 503, weather keeps working', async (t) => {
  const s = await start(async (u) => {
    if (u.startsWith(FORECAST)) throw new Error('down');
    return upstream(u);
  });
  t.after(s.close);
  assert.equal((await fetch(`${s.url}/forecast`)).status, 503);
  assert.equal((await fetch(`${s.url}/weather`)).status, 200);
});

test('keepWarm loads every upstream at start and schedules refreshes', async () => {
  const seen = [];
  const config = {
    port: 0, upstreamBase: BASE, allowedOrigins: [], cacheMs: 300_000,
    forecastBase: FORECAST, lat: 47.822016, lon: 12.463561, forecastCacheMs: 1_800_000,
  };
  const handle = createApp({ config, fetchText: async (u) => { seen.push(u); return upstream(u); } });
  const delays = [];
  const stop = handle.keepWarm((fn, ms) => { delays.push(ms); return setInterval(fn, 1e9); });
  await new Promise((r) => setImmediate(r));
  assert.equal(seen.length, 3);
  assert.deepEqual(delays, [270_000, 270_000, 1_620_000]);
  stop();
});
