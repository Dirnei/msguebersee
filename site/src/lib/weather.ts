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
  if (windKmh <= limits.gelbBisKmh) return { level: 'gelb', label: 'Böig, nur für Erfahrene' };
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

// strongest reading within the window ending at `current`; one calm reading between gusts must not turn the light green
export function recentPeak(points: Point[], current: Point, minutes = 60): number {
  const end = Date.parse(current.time);
  const start = end - minutes * 60_000;
  const inWindow = points.filter((p) => {
    const t = Date.parse(p.time);
    return t > start && t <= end;
  });
  return Math.max(current.windKmh, ...inWindow.map((p) => p.windKmh));
}
