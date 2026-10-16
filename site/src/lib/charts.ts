import type { TimeContext } from './flugzeiten';
import { forecastTip, type ForecastHour } from './forecast';
import { berlinClock } from './sun';
import { ampel, formatClock, type Point } from './weather';

type Limits = { gruenBisKmh: number; gelbBisKmh: number };

const DAY_MIN = 24 * 60;
const SLOT_MIN = 10;
const PAD = { left: 34, right: 10, top: 24 };
const LEVEL_FILL = { gruen: 'var(--green)', gelb: 'var(--yellow)', rot: 'var(--red)' } as const;
const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const NO_DATA = '<p class="muted">Heute noch keine Messwerte</p>';

const f = (n: number) => n.toFixed(1);
const attr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// station wall-clock minutes since midnight, straight from the ISO string
export function minuteOfDay(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function compass16(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function tip(p: Point): string {
  return `${formatClock(p.time)} Uhr · ${p.windKmh} km/h aus ${p.windDir} · ${p.tempC} °C · ${p.pressureHpa} hPa`;
}

export function speedClasses(limits: Limits) {
  return [
    { level: 'gruen' as const, label: `unter ${limits.gruenBisKmh} km/h` },
    { level: 'gelb' as const, label: `${limits.gruenBisKmh}–${limits.gelbBisKmh} km/h` },
    { level: 'rot' as const, label: `über ${limits.gelbBisKmh} km/h` },
  ];
}

export function legendHtml(limits: Limits, { gusts = false } = {}): string {
  const items = speedClasses(limits).map((c) => `<li><span class="swatch" style="background:${LEVEL_FILL[c.level]}"></span>${c.label}</li>`);
  if (gusts) items.push('<li><span class="swatch gust-key"></span>Böen</li>');
  return `<ul class="chart-legend">${items.join('')}</ul>`;
}

// shared time axis so wind, temperature and pressure line up underneath each other
function timeAxis(width: number) {
  const plotW = width - PAD.left - PAD.right;
  const x = (min: number) => PAD.left + (min / DAY_MIN) * plotW;
  const every = plotW < 420 ? 6 : 3;
  return { plotW, x, every, slotW: (SLOT_MIN / DAY_MIN) * plotW };
}

function hourLabels(width: number, y: number): string {
  const { x, every } = timeAxis(width);
  let out = '';
  for (let h = 0; h <= 24; h += every) {
    const anchor = h === 0 ? 'start' : h === 24 ? 'end' : 'middle';
    out += `<text x="${f(x(h * 60))}" y="${y}" text-anchor="${anchor}" class="tick">${String(h).padStart(2, '0')}</text>`;
  }
  return out;
}

function gridlines(width: number, ticks: number[], y: (v: number) => number, unit = ''): string {
  return ticks
    .map((t) => `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${f(y(t))}" y2="${f(y(t))}" class="grid"/>` +
      `<text x="${PAD.left - 6}" y="${f(y(t) + 4)}" text-anchor="end" class="tick">${t}${unit}</text>`)
    .join('');
}

// column with a rounded top and a square foot on the baseline
function column(x: number, w: number, top: number, base: number): string {
  const r = Math.min(2, w / 2, base - top);
  return `M${f(x)} ${f(base)}V${f(top + r)}Q${f(x)} ${f(top)} ${f(x + r)} ${f(top)}H${f(x + w - r)}Q${f(x + w)} ${f(top)} ${f(x + w)} ${f(top + r)}V${f(base)}Z`;
}

function hitColumns(points: Point[], width: number, top: number, bottom: number): string {
  const { x, slotW } = timeAxis(width);
  return points
    .map((p) => `<rect x="${f(x(minuteOfDay(p.time)) - slotW / 2)}" y="${top}" width="${f(slotW)}" height="${bottom - top}" class="hit col" data-tip="${tip(p)}"/>`)
    .join('');
}

const ROW_H = 24;

// Berlin midnight of the day the readings belong to, from the reading's own offset
function dayStartMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00${iso.slice(19) || 'Z'}`);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// night shading behind the plot, with sunrise/sunset marked in the top padding
function nightLayer(ctx: TimeContext | undefined, xOf: (ms: number) => number, width: number, base: number, labels: boolean): string {
  if (!ctx) return '';
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const narrow = x1 - x0 < 420;
  let out = '';
  for (const [a, b] of ctx.nights) {
    const l = clamp(xOf(a), x0, x1);
    const r = clamp(xOf(b), x0, x1);
    if (r - l > 0.5) out += `<rect x="${f(l)}" y="${PAD.top}" width="${f(r - l)}" height="${base - PAD.top}" class="night"/>`;
  }
  if (!labels) return out;
  for (const { rise, set } of ctx.sun) {
    // label on the night side of the line (sunrise: left, sunset: right) so the two never meet; flip at the edges
    for (const [ms, word, arrow, nightLeft] of [[rise, 'aufgang', '↑', true], [set, 'untergang', '↓', false]] as const) {
      const x = xOf(ms);
      if (x < x0 || x > x1) continue;
      const text = narrow ? `${arrow} ${berlinClock(ms)}` : `Sonnen${word} ${berlinClock(ms)}`;
      const textW = text.length * 6.2;
      const left = nightLeft ? x - textW - 3 >= 0 : x + textW + 3 > width;
      out += `<line x1="${f(x)}" x2="${f(x)}" y1="${PAD.top - 6}" y2="${base}" class="sun-line"/>` +
        `<text x="${f(left ? x - 3 : x + 3)}" y="${PAD.top - 9}" text-anchor="${left ? 'end' : 'start'}" class="tick sun">${text}</text>`;
    }
  }
  return out;
}

// one strip per flight category under the time axis: grey track, blue where flying is allowed
function flightRows(ctx: TimeContext | undefined, xOf: (ms: number) => number, width: number, y0: number): string {
  if (!ctx) return '';
  const x0 = PAD.left;
  const x1 = width - PAD.right;
  return ctx.rows
    .map((row, i) => {
      const y = y0 + i * ROW_H;
      const bands = row.windows
        .map((w) => {
          const l = clamp(xOf(w.from), x0, x1);
          const r = clamp(xOf(w.to), x0, x1);
          if (r - l < 0.5) return '';
          return `<rect x="${f(l)}" y="${y + 12}" width="${f(r - l)}" height="6" rx="3" class="fly"/>` +
            `<rect x="${f(l)}" y="${y}" width="${f(r - l)}" height="${ROW_H - 2}" class="hit" data-tip="${attr(w.tip)}"/>`;
        })
        .join('');
      return `<text x="${x0}" y="${y + 8}" class="tick row-label">${row.label}</text>` +
        `<line x1="${x0}" x2="${x1}" y1="${y + 15}" y2="${y + 15}" class="track"/>` + bands;
    })
    .join('');
}

const rowsHeight = (ctx: TimeContext | undefined) => (ctx ? ctx.rows.length * ROW_H + 10 : 0);

export function windChartSvg(points: Point[], limits: Limits, width: number, ctx?: TimeContext): string {
  if (points.length === 0) return NO_DATA;
  const height = 240 + rowsHeight(ctx);
  const base = 178;
  const peak = Math.max(...points.map((p) => p.windKmh));
  const max = Math.max(30, Math.ceil(peak / 10) * 10);
  const y = (v: number) => base - (v / max) * (base - PAD.top);
  const { x, slotW, plotW } = timeAxis(width);
  const barW = Math.max(1, Math.min(24, slotW - 2));
  const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);

  const bars = points
    .map((p) => {
      const mid = x(minuteOfDay(p.time));
      const top = Math.min(base - 1, y(p.windKmh));
      return `<path d="${column(mid - barW / 2, barW, top, base)}" fill="${LEVEL_FILL[ampel(p.windKmh, limits).level]}"/>`;
    })
    .join('');

  // one direction arrow per labelled hour, from the reading closest to that hour
  const arrowEvery = plotW < 420 ? 2 : 1;
  let arrows = '';
  for (let h = 0; h < 24; h += arrowEvery) {
    const near = points.find((p) => Math.abs(minuteOfDay(p.time) - h * 60) < SLOT_MIN);
    if (!near || near.windKmh === 0) continue;
    // arrow shows where the wind blows to
    arrows += `<g transform="translate(${f(x(h * 60))} 200) rotate(${near.windDeg + 180})"><path d="M0 -6L4 4L0 2L-4 4Z" class="arrow"/><title>${formatClock(near.time)} Uhr: Wind aus ${near.windDir}</title></g>`;
  }

  const last = points[points.length - 1];
  const start = dayStartMs(points[0].time);
  const xOf = (ms: number) => x((ms - start) / 60_000);
  return (
    `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Windgeschwindigkeit heute, höchstens ${peak} km/h, zuletzt ${last.windKmh} km/h aus ${last.windDir}">` +
    nightLayer(ctx, xOf, width, base, true) +
    gridlines(width, ticks, y) +
    `<text x="0" y="10" class="tick unit">km/h</text>` +
    bars +
    `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${base}" y2="${base}" class="axis"/>` +
    arrows +
    `<text x="${PAD.left - 6}" y="204" text-anchor="end" class="tick">Ri.</text>` +
    hourLabels(width, 226) +
    hitColumns(points, width, PAD.top, base) +
    flightRows(ctx, xOf, width, 244) +
    `</svg>`
  );
}

function niceRange(values: number[], step: number): [number, number] {
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.ceil(Math.max(...values) / step) * step;
  return hi === lo ? [lo - step, hi + step] : [lo, hi];
}

export function lineChartSvg(points: Point[], key: 'tempC' | 'pressureHpa', unit: string, label: string, width: number, ctx?: TimeContext): string {
  if (points.length === 0) return NO_DATA;
  const height = 160;
  const base = 122;
  const values = points.map((p) => p[key]);
  const step = key === 'tempC' ? 5 : 2;
  const [lo, hi] = niceRange(values, step);
  const y = (v: number) => base - ((v - lo) / (hi - lo)) * (base - PAD.top);
  const { x } = timeAxis(width);
  const all = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);
  const ticks = all.length > 5 ? all.filter((_, i) => i % 2 === 0) : all;
  const xy = points.map((p) => [x(minuteOfDay(p.time)), y(p[key])] as const);
  const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${f(px)} ${f(py)}`).join('');
  const area = `${line}L${f(xy[xy.length - 1][0])} ${base}L${f(xy[0][0])} ${base}Z`;
  const [ex, ey] = xy[xy.length - 1];
  const last = values[values.length - 1];
  const nearRight = ex > width - PAD.right - 60;
  return (
    `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} heute, zuletzt ${last} ${unit}">` +
    nightLayer(ctx, (ms) => x((ms - dayStartMs(points[0].time)) / 60_000), width, base, false) +
    gridlines(width, ticks, y) +
    `<text x="0" y="10" class="tick unit">${unit}</text>` +
    `<path d="${area}" class="area"/>` +
    `<path d="${line}" class="line"/>` +
    `<circle cx="${f(ex)}" cy="${f(ey)}" r="4" class="dot"/>` +
    `<text x="${f(nearRight ? ex - 8 : ex + 8)}" y="${f(ey - 8)}" text-anchor="${nearRight ? 'end' : 'start'}" class="value">${last} ${unit}</text>` +
    hourLabels(width, 146) +
    hitColumns(points, width, PAD.top, base) +
    `</svg>`
  );
}

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${f(cx + r * Math.sin(a))} ${f(cy - r * Math.cos(a))}`;
  return `M${pt(r0, a0)}L${pt(r1, a0)}A${f(r1)} ${f(r1)} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${f(r0)} ${f(r0)} 0 0 0 ${pt(r0, a0)}Z`;
}

export function windRoseSvg(points: Point[], limits: Limits, size: number): string {
  if (points.length === 0) return NO_DATA;
  const classes = speedClasses(limits);
  const counts = COMPASS.map(() => ({ gruen: 0, gelb: 0, rot: 0 }));
  let calm = 0;
  for (const p of points) {
    if (p.windKmh === 0) calm++;
    else counts[COMPASS.indexOf(compass16(p.windDeg))][ampel(p.windKmh, limits).level]++;
  }
  const totals = counts.map((c) => c.gruen + c.gelb + c.rot);
  const maxCount = Math.max(1, ...totals);
  const c = size / 2;
  const R = c - 22;
  const hole = 10;
  // area-true: the wedge's area, not its length, grows with the count
  const r = (n: number) => hole + Math.sqrt(n / maxCount) * (R - hole);
  const half = Math.PI / 16 - 0.02;

  let rings = '';
  for (const n of [...new Set([Math.round(maxCount / 4), Math.round(maxCount / 2), maxCount])].filter((n) => n > 0)) {
    rings += `<circle cx="${c}" cy="${c}" r="${f(r(n))}" class="grid ring"/>`;
  }
  const labels = [['N', 0], ['O', 90], ['S', 180], ['W', 270]]
    .map(([t, deg]) => {
      const a = ((deg as number) * Math.PI) / 180;
      return `<text x="${f(c + (R + 12) * Math.sin(a))}" y="${f(c - (R + 12) * Math.cos(a) + 4)}" text-anchor="middle" class="tick compass">${t}</text>`;
    })
    .join('');

  const wedges = counts
    .map((cnt, i) => {
      if (totals[i] === 0) return '';
      const a = (i * Math.PI) / 8;
      let acc = 0;
      let out = '';
      for (const cl of classes) {
        const n = cnt[cl.level];
        if (n === 0) continue;
        out += `<path d="${wedge(c, c, r(acc), r(acc + n), a - half, a + half)}" fill="${LEVEL_FILL[cl.level]}" class="seg"/>`;
        acc += n;
      }
      const parts = classes.filter((cl) => cnt[cl.level] > 0).map((cl) => `${cnt[cl.level]}× ${cl.label}`).join(', ');
      out += `<path d="${wedge(c, c, 0, R, a - Math.PI / 16, a + Math.PI / 16)}" class="hit" data-tip="Aus ${COMPASS[i]}: ${totals[i]} Messwerte (${parts})"/>`;
      return out;
    })
    .join('');

  const top = totals.indexOf(maxCount);
  return (
    `<svg class="chart rose" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Windrose heute: meist aus ${COMPASS[top]}">` +
    rings + labels + wedges +
    `<text x="0" y="12" class="tick">Außenring: ${maxCount}×</text>` +
    (calm ? `<text x="${c}" y="${size - 2}" text-anchor="middle" class="tick">${calm}× windstill</text>` : '') +
    `</svg>`
  );
}

export function valuesTableHtml(points: Point[]): string {
  if (points.length === 0) return NO_DATA;
  const rows = [...points]
    .reverse()
    .map((p) => `<tr><td>${formatClock(p.time)}</td><td>${p.windKmh}</td><td>${p.windDir}</td><td>${p.tempC}</td><td>${p.pressureHpa}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Zeit</th><th>Wind km/h</th><th>aus</th><th>°C</th><th>hPa</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function forecastChartSvg(hours: ForecastHour[], limits: Limits, width: number, ctx?: TimeContext): string {
  if (hours.length === 0) return '<p class="muted">Keine Prognose verfügbar</p>';
  const height = 220 + rowsHeight(ctx);
  const base = 158;
  const peak = Math.max(...hours.map((h) => h.gustKmh));
  const max = Math.max(30, Math.ceil(peak / 10) * 10);
  const y = (v: number) => base - (Math.min(v, max) / max) * (base - PAD.top);
  const plotW = width - PAD.left - PAD.right;
  const slot = plotW / hours.length;
  const barW = Math.max(4, Math.min(24, slot - 8));
  const labelEvery = slot < 34 ? 2 : 1;
  const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);

  const cols = hours
    .map((h, i) => {
      const mid = PAD.left + slot * (i + 0.5);
      const top = Math.min(base - 1, y(h.windKmh));
      const gy = y(h.gustKmh);
      const fill = LEVEL_FILL[ampel(h.windKmh, limits).level];
      // gust: thin whisker from the bar top to a short cap
      const gust = h.gustKmh > h.windKmh
        ? `<line x1="${f(mid)}" x2="${f(mid)}" y1="${f(top)}" y2="${f(gy)}" class="gust"/><line x1="${f(mid - barW / 2)}" x2="${f(mid + barW / 2)}" y1="${f(gy)}" y2="${f(gy)}" class="gust cap"/>`
        : '';
      const label = i % labelEvery === 0
        ? `<text x="${f(mid)}" y="${base + 52}" text-anchor="middle" class="tick">${formatClock(h.time).slice(0, 2)}</text>`
        : '';
      const arrow = h.windKmh > 0
        ? `<g transform="translate(${f(mid)} ${base + 22}) rotate(${h.windDeg + 180})"><path d="M0 -6L4 4L0 2L-4 4Z" class="arrow"/></g>`
        : '';
      return `<path d="${column(mid - barW / 2, barW, top, base)}" fill="${fill}"/>${gust}${arrow}${label}` +
        `<rect x="${f(mid - slot / 2)}" y="${PAD.top}" width="${f(slot)}" height="${base + 56 - PAD.top}" class="hit col" data-tip="${forecastTip(h)}"/>`;
    })
    .join('');

  const first = Date.parse(hours[0].time);
  const xOf = (ms: number) => PAD.left + ((ms - first) / 3_600_000) * slot;
  return (
    `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Wind-Prognose ${formatClock(hours[0].time)} bis ${formatClock(hours[hours.length - 1].time)} Uhr, Böen bis ${peak} km/h">` +
    nightLayer(ctx, xOf, width, base, true) +
    gridlines(width, ticks, y) +
    `<text x="0" y="10" class="tick unit">km/h</text>` +
    `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${base}" y2="${base}" class="axis"/>` +
    `<text x="${PAD.left - 6}" y="${base + 26}" text-anchor="end" class="tick">Ri.</text>` +
    `<text x="${PAD.left - 6}" y="${base + 52}" text-anchor="end" class="tick">Uhr</text>` +
    cols +
    flightRows(ctx, xOf, width, base + 62) +
    `</svg>`
  );
}
