import { unixToBerlinIso } from './time.js';

const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

// Open-Meteo hourly response (timeformat=unixtime) -> the relay's forecast shape
export function parseForecast(json) {
  const h = json?.hourly;
  if (!Array.isArray(h?.time) || h.time.length === 0) throw new Error('forecast without hourly data');
  return h.time.map((t, i) => ({
    time: unixToBerlinIso(t),
    windKmh: Math.round(h.wind_speed_10m[i]),
    gustKmh: Math.round(h.wind_gusts_10m[i]),
    windDeg: Math.round(h.wind_direction_10m[i]),
    windDir: DIRS[Math.round(h.wind_direction_10m[i] / 45) % 8],
    tempC: Math.round(h.temperature_2m[i]),
    rainPct: h.precipitation_probability[i] ?? null,
  }));
}

export function forecastUrl({ forecastBase, lat, lon }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation_probability',
    timezone: 'Europe/Berlin',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
    forecast_days: '2',
  });
  return `${forecastBase}?${params}`;
}
