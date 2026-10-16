export function readConfig(env) {
  const base = env.UPSTREAM_BASE ?? 'https://xn--msg-bersee-deb.de/Programme/';
  return {
    port: Number(env.PORT ?? 8080),
    upstreamBase: base.endsWith('/') ? base : `${base}/`,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    cacheMs: Number(env.CACHE_SECONDS ?? 300) * 1000,
    forecastBase: env.FORECAST_BASE ?? 'https://api.open-meteo.com/v1/forecast',
    lat: Number(env.FORECAST_LAT ?? 47.822016),
    lon: Number(env.FORECAST_LON ?? 12.463561),
    forecastCacheMs: Number(env.FORECAST_CACHE_SECONDS ?? 1800) * 1000,
  };
}
