import { verein } from '../data/verein';
import { ampel, formatClock, isOutdated, windBarsSvg, type WeatherResponse, type WebcamResponse } from '../lib/weather';

const RELAY = (import.meta.env.PUBLIC_RELAY_URL ?? '').replace(/\/$/, '');
const REFRESH_MS = 5 * 60 * 1000;

function all<T extends Element = HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}

function setText(name: string, text: string) {
  for (const el of all(`[data-live="${name}"]`)) el.textContent = text;
}

function setStatus(level: string, text: string) {
  for (const el of all('[data-live="status"]')) {
    el.dataset.level = level;
    el.textContent = text;
  }
}

function setMessage(name: string, text: string) {
  for (const el of all(`[data-live="${name}"]`)) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    el.replaceChildren(p);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(RELAY + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function renderWeather(w: WeatherResponse) {
  for (const el of all('[data-live="bars"]')) el.innerHTML = windBarsSvg(w.today);
  const c = w.current;
  if (!c) {
    setStatus('off', 'Heute noch keine Messwerte');
    return;
  }
  setText('wind', String(c.windKmh));
  setText('dir', c.windDir);
  setText('temp', String(c.tempC));
  setText('pressure', String(c.pressureHpa));
  if (w.stale || isOutdated(c.time, Date.now())) {
    setText('time', `· Stand ${formatClock(c.time)}`);
    setStatus('off', `Letzter Messwert von ${formatClock(c.time)} Uhr`);
  } else {
    setText('time', `· ${formatClock(c.time)}`);
    const a = ampel(c.windKmh, verein.ampel);
    setStatus(a.level, a.label);
  }
}

function renderWebcam(w: WebcamResponse) {
  const latest = w.images[0];
  const hero = document.querySelector<HTMLImageElement>('img[data-live="hero"]');
  if (hero && latest && hero.dataset.current !== latest.url) {
    const probe = new Image();
    probe.onload = () => {
      hero.removeAttribute('srcset');
      hero.removeAttribute('sizes');
      hero.src = latest.url;
      hero.alt = `Webcam am Flugplatz, ${formatClock(latest.time)} Uhr`;
      hero.dataset.current = latest.url;
    };
    probe.src = latest.url;
  }
  for (const box of all('[data-live="thumbs"]')) {
    box.replaceChildren(
      ...w.images.slice(0, 6).map((image) => {
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = `Webcam ${formatClock(image.time)} Uhr`;
        img.loading = 'lazy';
        const cap = document.createElement('figcaption');
        cap.textContent = formatClock(image.time);
        fig.append(img, cap);
        return fig;
      }),
    );
  }
}

function refreshStationImages() {
  for (const img of all<HTMLImageElement>('img[data-refresh-src]')) {
    img.src = `${img.dataset.refreshSrc}?t=${Date.now()}`;
  }
}

async function refresh() {
  refreshStationImages();
  const [weather, webcam] = RELAY
    ? await Promise.allSettled([getJson<WeatherResponse>('/weather'), getJson<WebcamResponse>('/webcam')])
    : [{ status: 'rejected' as const }, { status: 'rejected' as const }];
  if (weather.status === 'fulfilled') {
    renderWeather(weather.value);
  } else {
    setStatus('off', 'Wetterdaten gerade nicht verfügbar');
    setMessage('bars', 'Messwerte gerade nicht verfügbar');
  }
  if (webcam.status === 'fulfilled') renderWebcam(webcam.value);
  else setMessage('thumbs', 'Webcam gerade nicht verfügbar');
}

refresh();
setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
