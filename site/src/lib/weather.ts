export type Point = {
  time: string;
  windDir: string;
  windDeg: number;
  windKmh: number;
  tempC: number;
  pressureHpa: number;
};
export type WeatherResponse = { updated: string | null; current: Point | null; today: Point[]; stale: boolean };
export type WebcamResponse = { images: { url: string; time: string }[]; stale: boolean };
export type Ampel = { level: 'gruen' | 'gelb' | 'rot'; label: string };

export function ampel(windKmh: number, limits: { gruenBisKmh: number; gelbBisKmh: number }): Ampel {
  if (windKmh < limits.gruenBisKmh) return { level: 'gruen', label: 'Gutes Flugwetter' };
  if (windKmh <= limits.gelbBisKmh) return { level: 'gelb', label: 'Böig – nur für Erfahrene' };
  return { level: 'rot', label: 'Zu windig' };
}

// The relay sends station-local time with offset; show that wall-clock time, not the browser's.
export function formatClock(iso: string): string {
  return iso.slice(11, 16);
}

const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });

// Station dates are Berlin wall-clock dates; compare against "today" in Berlin, not the browser zone.
export function isToday(iso: string, nowMs: number): boolean {
  return iso.slice(0, 10) === BERLIN_DATE.format(nowMs);
}

export function formatDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

export function isOutdated(iso: string, nowMs: number, maxAgeMin = 30): boolean {
  return nowMs - Date.parse(iso) > maxAgeMin * 60_000;
}

export function windBarsSvg(today: Point[], { width = 480, height = 90 } = {}): string {
  if (today.length === 0) return '<p class="muted">Heute noch keine Messwerte</p>';
  const peak = Math.max(...today.map((p) => p.windKmh));
  const scale = Math.max(20, peak);
  const slot = width / today.length;
  const bars = today
    .map((p, i) => {
      const h = Math.max(1, (p.windKmh / scale) * height);
      return `<rect x="${(i * slot).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${Math.max(0.5, slot - 1).toFixed(1)}" height="${h.toFixed(1)}"><title>${formatClock(p.time)} · ${p.windKmh} km/h</title></rect>`;
    })
    .join('');
  return (
    `<svg class="wind-bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Windverlauf heute, höchstens ${peak} km/h">${bars}</svg>` +
    `<div class="axis"><span>${formatClock(today[0].time)}</span><span>${formatClock(today[today.length - 1].time)}</span></div>`
  );
}
