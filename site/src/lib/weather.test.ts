import { describe, expect, test } from 'vitest';
import { ampel, formatClock, formatDay, isOutdated, isToday, windBarsSvg, type Point } from './weather';

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

test('isToday compares with the current date in Europe/Berlin', () => {
  // 23:30 UTC on the 15th is already the 16th in Berlin (CEST)
  const now = Date.parse('2026-10-15T23:30:00Z');
  expect(isToday('2026-10-16T00:10:00+02:00', now)).toBe(true);
  expect(isToday('2026-10-15T23:50:00+02:00', now)).toBe(false);
});

test('formatDay gives a short German date', () => {
  expect(formatDay('2026-10-05T20:40:00+02:00')).toBe('05.10.');
});
