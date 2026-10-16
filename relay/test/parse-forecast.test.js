import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forecastUrl, parseForecast } from '../src/parse-forecast.js';
import { unixToBerlinIso } from '../src/time.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo.json', import.meta.url), 'utf8'));

test('parses hourly Open-Meteo data into rounded hours with Berlin times', () => {
  const hours = parseForecast(fixture);
  assert.equal(hours.length, 24);
  assert.equal(hours[0].time, '2026-10-16T00:00:00+02:00');
  assert.deepEqual(Object.keys(hours[14]), ['time', 'windKmh', 'gustKmh', 'windDeg', 'windDir', 'tempC', 'rainPct']);
  assert.equal(hours[14].time, '2026-10-16T14:00:00+02:00');
  for (const h of hours) assert.ok(Number.isInteger(h.windKmh) && Number.isInteger(h.gustKmh));
});

test('direction names follow the station (8 German points)', () => {
  const one = (deg) => parseForecast({ hourly: { time: [0], wind_speed_10m: [5], wind_gusts_10m: [9], wind_direction_10m: [deg], temperature_2m: [10], precipitation_probability: [0] } })[0].windDir;
  assert.equal(one(0), 'N');
  assert.equal(one(350), 'N');
  assert.equal(one(225), 'SW');
  assert.equal(one(100), 'O');
});

test('empty or broken responses are an error, not an empty forecast', () => {
  assert.throws(() => parseForecast({}), /without hourly/);
  assert.throws(() => parseForecast({ hourly: { time: [] } }), /without hourly/);
});

test('unix times become Berlin wall-clock across the DST switch', () => {
  assert.equal(unixToBerlinIso(Date.UTC(2026, 9, 25, 0, 0) / 1000), '2026-10-25T02:00:00+02:00');
  assert.equal(unixToBerlinIso(Date.UTC(2026, 9, 25, 1, 0) / 1000), '2026-10-25T02:00:00+01:00');
  assert.equal(unixToBerlinIso(Date.UTC(2026, 0, 15, 11, 30) / 1000), '2026-01-15T12:30:00+01:00');
});

test('forecast URL asks for km/h, Berlin time and the given place', () => {
  const url = new URL(forecastUrl({ forecastBase: 'https://api.open-meteo.com/v1/forecast', lat: 47.822016, lon: 12.463561 }));
  assert.equal(url.searchParams.get('latitude'), '47.822016');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
});
