import { sunTimes } from './sun';

// 'sonne' = Sonnenaufgang bis Sonnenuntergang, [] = kein Flugbetrieb
export type Fenster = 'sonne' | [string, string][];
export type Flugzeit = { was: string; kurz: string; werktags: Fenster; samstag: Fenster; sonntag: Fenster };
export type Tagesart = 'werktags' | 'samstag' | 'sonntag';
export type Window = { from: number; to: number; tip: string };
export type TimeContext = {
  nights: [number, number][];
  sun: { rise: number; set: number }[];
  rows: { label: string; windows: Window[] }[];
};

const DAY_MS = 86_400_000;

// Gauss/Meeus: Easter Sunday in the Gregorian calendar
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// Gesetzliche Feiertage in Bayern; Mariä Himmelfahrt gilt in Übersee (überwiegend katholisch).
export function feiertageBayern(year: number): Set<string> {
  const e = easter(year);
  return new Set([
    `${year}-01-01`, `${year}-01-06`, `${year}-05-01`, `${year}-08-15`, `${year}-10-03`,
    `${year}-11-01`, `${year}-12-25`, `${year}-12-26`,
    addDays(e, -2), addDays(e, 1), addDays(e, 39), addDays(e, 50), addDays(e, 60),
  ]);
}

export function tagesart(ymd: string): Tagesart {
  const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || feiertageBayern(Number(ymd.slice(0, 4))).has(ymd)) return 'sonntag';
  return weekday === 6 ? 'samstag' : 'werktags';
}

// "10:00" -> "10", "17:30" -> "17:30"
const short = (t: string) => (t.endsWith(':00') ? String(Number(t.slice(0, 2))) : t.replace(/^0/, ''));

function fensterText(f: Fenster): string {
  if (f === 'sonne') return 'Sonnenaufgang bis Sonnenuntergang';
  if (f.length === 0) return 'kein Flugbetrieb';
  const parts = f.map(([a, b]) => `${short(a)}–${short(b)}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}` : parts[0];
  return `${list} Uhr`;
}

const same = (a: Fenster, b: Fenster) => JSON.stringify(a) === JSON.stringify(b);

// Lines for the Flugzeiten card, grouping days with identical times
export function beschreibung(z: Flugzeit): string[] {
  if (same(z.werktags, z.samstag) && same(z.samstag, z.sonntag)) return [`Mo–So: ${fensterText(z.werktags)}`];
  const lines = same(z.werktags, z.samstag)
    ? [`Mo–Sa: ${fensterText(z.werktags)}`]
    : [`Mo–Fr: ${fensterText(z.werktags)}`, `Sa: ${fensterText(z.samstag)}`];
  return [...lines, `So & Feiertag: ${fensterText(z.sonntag)}`];
}

const OFFSET = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });

// "+02:00" / "+01:00" for that Berlin date
export function berlinOffset(ymd: string): string {
  const name = OFFSET.formatToParts(Date.parse(`${ymd}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return name.replace('GMT', '') || '+00:00';
}

export function berlinMs(ymd: string, hhmm: string): number {
  return Date.parse(`${ymd}T${hhmm}:00${berlinOffset(ymd)}`);
}

const TAG = { werktags: 'werktags', samstag: 'samstags', sonntag: 'sonn- & feiertags' } as const;

// Nights, sunrise/sunset and flight windows for the given Berlin dates
export function timeContext(days: string[], lat: number, lon: number, flugzeiten: Flugzeit[]): TimeContext {
  const ctx: TimeContext = { nights: [], sun: [], rows: flugzeiten.map((z) => ({ label: z.kurz, windows: [] })) };
  for (const ymd of days) {
    const { sunrise, sunset } = sunTimes(ymd, lat, lon);
    const start = berlinMs(ymd, '00:00');
    const end = berlinMs(addDays(ymd, 1), '00:00');
    ctx.nights.push([start, sunrise], [sunset, end]);
    ctx.sun.push({ rise: sunrise, set: sunset });
    const art = tagesart(ymd);
    flugzeiten.forEach((z, i) => {
      const f = z[art];
      const tip = `${z.was} ${TAG[art]}: ${fensterText(f)}`;
      const windows = f === 'sonne' ? [{ from: sunrise, to: sunset, tip }] : f.map(([a, b]) => ({ from: berlinMs(ymd, a), to: berlinMs(ymd, b), tip }));
      ctx.rows[i].windows.push(...windows);
    });
  }
  return ctx;
}

export function nextDay(ymd: string): string {
  return addDays(ymd, 1);
}
