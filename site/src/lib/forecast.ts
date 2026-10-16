import { ampel, formatClock } from './weather';

export type ForecastHour = {
  time: string;
  windKmh: number;
  gustKmh: number;
  windDeg: number;
  windDir: string;
  tempC: number;
  rainPct: number | null;
};
export type ForecastResponse = { source: string; hours: ForecastHour[]; stale: boolean };
type Limits = { gruenBisKmh: number; gelbBisKmh: number };

const WORD = { gruen: 'ruhig', gelb: 'böig', rot: 'zu windig' } as const;
const RANK = { gruen: 0, gelb: 1, rot: 2 } as const;

// the running hour and the ones after it
export function upcoming(hours: ForecastHour[], nowMs: number, count = 12): ForecastHour[] {
  const hourStart = nowMs - (nowMs % 3_600_000);
  return hours.filter((h) => Date.parse(h.time) >= hourStart).slice(0, count);
}

const hourLabel = (iso: string) => `${Number(iso.slice(11, 13))} Uhr`;

// Only ever warns. Models miss local winds at the field (seen: station 13-22 km/h from S while every
// model said 1-5), so a forecast must never promise calm; it may only announce stronger wind.
export function forecastSummary(next: ForecastHour[], limits: Limits, span = 6): string {
  const window = next.slice(0, span);
  if (window.length === 0) return '';
  const levels = window.map((h) => ampel(h.windKmh, limits).level);
  const worse = levels.findIndex((l) => RANK[l] > RANK[levels[0]]);
  if (worse === -1) return '';
  return `Prognose: ab ${hourLabel(window[worse].time)} ${WORD[levels[worse]]}`;
}

export function forecastTip(h: ForecastHour): string {
  const rain = h.rainPct === null ? '' : ` · Regen ${h.rainPct} %`;
  return `${formatClock(h.time)} Uhr · Wind ${h.windKmh} km/h aus ${h.windDir}, Böen bis ${h.gustKmh} km/h · ${h.tempC} °C${rain}`;
}
