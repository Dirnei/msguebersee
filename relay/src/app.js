import { createCache } from './cache.js';
import { parseWeather } from './parse-weather.js';
import { parseWebcam } from './parse-webcam.js';

const RETRY_MS = 60_000;

export function createApp({ config, fetchText, now = Date.now }) {
  const opts = { ttlMs: config.cacheMs, retryMs: RETRY_MS, now };
  const weather = createCache(async () => parseWeather(await fetchText(`${config.upstreamBase}auslesen_tabelle.php`)), opts);
  const webcam = createCache(async () => {
    const images = parseWebcam(await fetchText(`${config.upstreamBase}Bildtest-email.php`), config.upstreamBase);
    if (images.length === 0) throw new Error('no webcam images found');
    return images;
  }, opts);

  return async function handle(req, res) {
    const origin = req.headers.origin;
    res.setHeader('vary', 'Origin');
    if (origin && config.allowedOrigins.includes(origin)) res.setHeader('access-control-allow-origin', origin);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET' });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });

    const path = new URL(req.url, 'http://relay').pathname;
    try {
      switch (path) {
        case '/health':
          res.writeHead(200, { 'content-type': 'text/plain' });
          return res.end('ok');
        case '/weather': {
          const { value, stale } = await weather();
          return sendJson(res, 200, { updated: value.current?.time ?? null, current: value.current, today: value.today, stale });
        }
        case '/webcam': {
          const { value, stale } = await webcam();
          return sendJson(res, 200, { images: value, stale });
        }
        case '/webcam/latest.jpg': {
          const { value } = await webcam();
          res.writeHead(302, { location: value[0].url, 'cache-control': 'no-store' });
          return res.end();
        }
        default:
          return sendJson(res, 404, { error: 'not found' });
      }
    } catch (error) {
      console.error(`${path}: ${error.message}`);
      return sendJson(res, 503, { error: 'upstream unavailable' });
    }
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=60' : 'no-store',
  });
  res.end(JSON.stringify(body));
}
