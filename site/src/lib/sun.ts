// Sunrise/sunset from the standard sunrise equation (about ±1 min), so the site needs no extra service.
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440587.5;
const J2000 = 2451545;

export type SunTimes = { sunrise: number; sunset: number };

export function sunTimes(ymd: string, lat: number, lon: number): SunTimes {
  const [y, m, d] = ymd.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d, 12) / DAY_MS + J1970;
  // east longitude reaches noon earlier
  const n = Math.round(jd - J2000 - 0.0009 + lon / 360);
  const jStar = J2000 + 0.0009 - lon / 360 + n;
  const M = (357.5291 + 0.98560028 * (jStar - J2000)) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
  const w = Math.acos(Math.min(1, Math.max(-1, cosW))) / RAD;
  const toMs = (j: number) => Math.round((j - J1970) * DAY_MS);
  return { sunrise: toMs(transit - w / 360), sunset: toMs(transit + w / 360) };
}

const CLOCK = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

export function berlinClock(ms: number): string {
  return CLOCK.format(ms);
}
