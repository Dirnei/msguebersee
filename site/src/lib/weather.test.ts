import { describe, expect, test } from 'vitest';
import { ampel, formatClock, formatDay, isOutdated, isToday, recentPeak, type Point } from './weather';

const limits = { gruenBisKmh: 15, gelbBisKmh: 25 };
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

test('isToday compares with the current date in Europe/Berlin', () => {
  // 23:30 UTC on the 15th is already the 16th in Berlin (CEST)
  const now = Date.parse('2026-10-15T23:30:00Z');
  expect(isToday('2026-10-16T00:10:00+02:00', now)).toBe(true);
  expect(isToday('2026-10-15T23:50:00+02:00', now)).toBe(false);
});

test('formatDay gives a short German date', () => {
  expect(formatDay('2026-10-05T20:40:00+02:00')).toBe('05.10.');
});

describe('recentPeak', () => {
  const at = (time: string, windKmh: number): Point => ({
    time: `2026-10-16T${time}:00+02:00`, windDir: 'S', windDeg: 180, windKmh, tempC: 15, pressureHpa: 1027,
  });
  const day = [at('08:50', 30), at('09:17', 22), at('09:47', 15), at('09:57', 17), at('10:07', 13)];

  test('takes the strongest reading of the last 60 minutes', () => {
    expect(recentPeak(day, day[4])).toBe(22);
  });

  test('readings older than the window do not count', () => {
    expect(recentPeak(day, day[4], 30)).toBe(17);
  });

  test('a lone reading is its own peak', () => {
    expect(recentPeak([], at('10:07', 13))).toBe(13);
  });
});
