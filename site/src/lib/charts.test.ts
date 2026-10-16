import { describe, expect, test } from 'vitest';
import { compass16, forecastChartSvg, legendHtml, lineChartSvg, minuteOfDay, NO_DATA, windChartSvg, windRoseSvg } from './charts';
import { verein } from '../data/verein';
import { timeContext } from './flugzeiten';
import type { ForecastHour } from './forecast';
import { berlinClock } from './sun';
import type { Point } from './weather';

const limits = { gruenBisKmh: 15, gelbBisKmh: 25 };
const point = (time: string, windKmh: number, windDeg = 224, windDir = 'SW'): Point => ({
  time: `2026-10-15T${time}:00+02:00`, windDir, windDeg, windKmh, tempC: 14, pressureHpa: 1030,
});

test('minuteOfDay reads station wall-clock time', () => {
  expect(minuteOfDay('2026-10-15T00:00:00+02:00')).toBe(0);
  expect(minuteOfDay('2026-10-15T20:40:00+02:00')).toBe(1240);
});

test('compass16 maps degrees onto 16 German directions', () => {
  expect(compass16(0)).toBe('N');
  expect(compass16(359)).toBe('N');
  expect(compass16(90)).toBe('O');
  expect(compass16(224)).toBe('SW');
  expect(compass16(200)).toBe('SSW');
});

describe('windChartSvg', () => {
  const points = [point('00:00', 2), point('12:00', 20), point('23:50', 30)];

  test('one bar per reading, coloured by the traffic light', () => {
    const svg = windChartSvg(points, limits, 600);
    expect(svg.match(/<path d="M[^"]*" fill="var\(--green\)"/g)).toHaveLength(1);
    expect(svg.match(/fill="var\(--yellow\)"/g)).toHaveLength(1);
    expect(svg.match(/fill="var\(--red\)"/g)).toHaveLength(1);
    expect(svg).toContain('aria-label="Windgeschwindigkeit heute, höchstens 30 km/h, zuletzt 30 km/h aus SW"');
  });

  test('bars sit on the time of day, so a half-day of data fills half the axis', () => {
    const svg = windChartSvg([point('12:00', 10)], limits, 1044);
    // plot runs from x=34 to x=1034, noon is the middle
    expect(svg).toMatch(/class="hit col" data-tip="12:00 Uhr · 10 km\/h aus SW · 14 °C · 1030 hPa"/);
    const x = Number(/<rect x="([\d.]+)" y="24" width="([\d.]+)"/.exec(svg)![1]);
    const w = Number(/<rect x="([\d.]+)" y="24" width="([\d.]+)"/.exec(svg)![2]);
    expect(x + w / 2).toBeCloseTo(534, 0);
  });

  test('y axis grows past 30 km/h in clean steps', () => {
    expect(windChartSvg([point('10:00', 43)], limits, 600)).toContain('>50</text>');
  });

  test('direction arrows point downwind, one per hour on wide charts', () => {
    const svg = windChartSvg([point('10:00', 12, 270, 'W'), point('11:00', 12, 90, 'O')], limits, 600);
    expect(svg).toContain('rotate(450)');
    expect(svg).toContain('rotate(270)');
  });

  test('no data gives the friendly message', () => {
    expect(windChartSvg([], limits, 600)).toBe(NO_DATA);
  });
});

test('lineChartSvg labels only the latest value', () => {
  const pts = [{ ...point('08:00', 5), tempC: 9 }, { ...point('10:00', 5), tempC: 17 }];
  const svg = lineChartSvg(pts, 'tempC', '°C', 'Temperatur', 600);
  expect(svg.match(/class="value"/g)).toHaveLength(1);
  expect(svg).toContain('>17 °C</text>');
  expect(svg).toContain('aria-label="Temperatur heute, zuletzt 17 °C"');
});

describe('windRoseSvg', () => {
  test('stacks speed classes per direction and names the main direction', () => {
    const svg = windRoseSvg([point('10:00', 5), point('10:10', 20), point('10:20', 8, 90, 'O')], limits, 300);
    expect(svg).toContain('data-tip="Aus SW: 2 Messwerte (1× unter 15 km/h, 1× 15-25 km/h)"');
    expect(svg).toContain('data-tip="Aus O: 1 Messwerte (1× unter 15 km/h)"');
    expect(svg).toContain('meist aus SW');
  });

  test('calm readings are counted, not given a direction', () => {
    const svg = windRoseSvg([point('10:00', 0, 0, 'N'), point('10:10', 5)], limits, 300);
    expect(svg).toContain('1× windstill');
    expect(svg).not.toContain('Aus N:');
  });
});

test('legend names the traffic-light classes from the club limits', () => {
  expect(legendHtml(limits)).toContain('unter 15 km/h');
  expect(legendHtml(limits)).toContain('15-25 km/h');
  expect(legendHtml(limits)).toContain('über 25 km/h');
});

describe('time context in charts', () => {
  const { lat, lon } = verein.koordinaten!;
  const sunday = timeContext(['2026-10-18'], lat, lon, verein.flugzeiten);
  const sundayPoint = (time: string, windKmh: number): Point => ({ ...point(time, windKmh), time: `2026-10-18T${time}:00+02:00` });

  test('wind chart shades the night and labels sunrise and sunset', () => {
    const svg = windChartSvg([sundayPoint('12:00', 10)], limits, 900, sunday);
    expect(svg.match(/class="night"/g)).toHaveLength(2);
    expect(svg).toContain(`Sonnenaufgang ${berlinClock(sunday.sun[0].rise)}`);
    expect(svg).toContain(`Sonnenuntergang ${berlinClock(sunday.sun[0].set)}`);
  });

  test('narrow charts use short sun labels', () => {
    const svg = windChartSvg([sundayPoint('12:00', 10)], limits, 360, sunday);
    expect(svg).toContain(`↑ ${berlinClock(sunday.sun[0].rise)}`);
  });

  test('one strip per flight category, bands only where flying is allowed', () => {
    const svg = windChartSvg([sundayPoint('12:00', 10)], limits, 900, sunday);
    expect(svg.match(/class="tick row-label"/g)).toHaveLength(3);
    // Sunday: electric 1 + combustion 2 + helicopter 0
    expect(svg.match(/class="fly"/g)).toHaveLength(3);
    expect(svg).toContain('data-tip="Verbrennermodelle sonn- &amp; feiertags');
  });

  test('without context the chart stays as before', () => {
    const svg = windChartSvg([sundayPoint('12:00', 10)], limits, 900);
    expect(svg).not.toContain('class="night"');
    expect(svg).not.toContain('row-label');
  });

  test('forecast windows are clipped to the forecast hours', () => {
    const hours: ForecastHour[] = [16, 17, 18].map((h) => ({
      time: `2026-10-18T${h}:00:00+02:00`, windKmh: 5, gustKmh: 9, windDeg: 180, windDir: 'S', tempC: 12, rainPct: 0,
    }));
    const svg = forecastChartSvg(hours, limits, 600, sunday);
    // 16-19 h on a Sunday: electric until sunset, combustion until 17:30
    expect(svg.match(/class="fly"/g)).toHaveLength(2);
    expect(svg).toContain(`Sonnenuntergang ${berlinClock(sunday.sun[0].set)}`);
  });
});
