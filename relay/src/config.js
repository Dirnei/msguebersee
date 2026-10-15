export function readConfig(env) {
  const base = env.UPSTREAM_BASE ?? 'https://xn--msg-bersee-deb.de/Programme/';
  return {
    port: Number(env.PORT ?? 8080),
    upstreamBase: base.endsWith('/') ? base : `${base}/`,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    cacheMs: Number(env.CACHE_SECONDS ?? 300) * 1000,
  };
}
