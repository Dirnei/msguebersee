import { describe, expect, test } from 'vitest';
import { forecastChartSvg } from './charts';
import { forecastSummary, forecastTip, upcoming, type ForecastHour } from './forecast';

const limits = { gruenBisKmh: 15, gelbBisKmh: 25 };
const hour = (h: number, windKmh: number, gustKmh = windKmh + 5): ForecastHour => ({
  time: `2026-10-16T${String(h).padStart(2, '0')}:00:00+02:00`, windKmh, gustKmh, windDeg: 225, windDir: 'SW', tempC: 15, rainPct: 10,
});
const day = Array.from({ length: 24 }, (_, h) => hour(h, 5));

test('upcoming starts at the running hour', () => {
  const next = upcoming(day, Date.parse('2026-10-16T10:38:00+02:00'), 12);
  expect(next[0].time).toBe('2026-10-16T10:00:00+02:00');
  expect(next).toHaveLength(12);
});

describe('forecastSummary', () => {
  test('names the hour it gets windier', () => {
    const next = [hour(10, 5), hour(11, 8), hour(12, 18), hour(13, 30)];
    expect(forecastSummary(next, limits)).toBe('Prognose: ab 12 Uhr böig');
    expect(forecastSummary([hour(10, 18), hour(11, 30)], limits)).toBe('Prognose: ab 11 Uhr zu windig');
  });

  test('never promises calm: steady or calming forecasts say nothing', () => {
    expect(forecastSummary(day.slice(10), limits)).toBe('');
    expect(forecastSummary([hour(10, 30), hour(11, 12)], limits)).toBe('');
  });

  test('nothing to say without data', () => {
    expect(forecastSummary([], limits)).toBe('');
  });
});

test('tooltip carries wind, gusts, temperature and rain', () => {
  expect(forecastTip(hour(14, 4, 11))).toBe('14:00 Uhr · Wind 4 km/h aus SW, Böen bis 11 km/h · 15 °C · Regen 10 %');
});

test('forecast chart: one coloured bar and gust whisker per hour', () => {
  const svg = forecastChartSvg([hour(10, 5, 12), hour(11, 20, 34), hour(12, 30, 30)], limits, 600);
  expect(svg.match(/class="hit col"/g)).toHaveLength(3);
  expect(svg.match(/class="gust cap"/g)).toHaveLength(2);
  expect(svg).toContain('fill="var(--red)"');
  expect(svg).toContain('Böen bis 34 km/h');
  expect(svg).toContain('>40</text>');
});
