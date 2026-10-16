import { expect, test } from 'vitest';
import { berlinClock, sunTimes } from './sun';

const FIELD = { lat: 47.822016, lon: 12.463561 };
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

test.each([
  // Open-Meteo for the field
  ['2026-10-16', '07:30', '18:20', 2],
  // DST ends that night; Open-Meteo still reports 07:43/18:03 in summer time, the clock shows one hour less
  ['2026-10-25', '06:43', '17:03', 3],
  // Munich almanac shifted by the longitude difference (~3.5 min earlier)
  ['2026-06-21', '05:10', '21:12', 3],
  ['2026-12-21', '07:58', '16:20', 3],
])('%s: sunrise %s, sunset %s', (ymd, rise, set, tolerance) => {
  const s = sunTimes(ymd, FIELD.lat, FIELD.lon);
  expect(Math.abs(minutes(berlinClock(s.sunrise)) - minutes(rise))).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(minutes(berlinClock(s.sunset)) - minutes(set))).toBeLessThanOrEqual(tolerance);
});
