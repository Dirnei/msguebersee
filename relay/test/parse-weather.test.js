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
