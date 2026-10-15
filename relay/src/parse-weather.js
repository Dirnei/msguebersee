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
