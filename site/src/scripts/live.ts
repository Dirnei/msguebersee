import { verein } from '../data/verein';
import { forecastChartSvg, legendHtml, lineChartSvg, valuesTableHtml, windChartSvg, windRoseSvg } from '../lib/charts';
import { timeContext, type TimeContext } from '../lib/flugzeiten';
import { forecastSummary, upcoming, type ForecastHour, type ForecastResponse } from '../lib/forecast';
import { ampel, formatClock, formatDay, isOutdated, isToday, recentPeak, type Point, type WeatherResponse, type WebcamResponse } from '../lib/weather';

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

// "20:40" for today, "15.10. 20:40" for an earlier day
function stamp(iso: string): string {
  return isToday(iso, Date.now()) ? formatClock(iso) : `${formatDay(iso)} ${formatClock(iso)}`;
}

let chartPoints: Point[] | null = null;
let forecastHours: ForecastHour[] | null = null;

// nights, sunrise/sunset and flight windows for the Berlin dates the charts cover
function contextFor(times: string[]): TimeContext | undefined {
  const k = verein.koordinaten;
  if (!k || times.length === 0) return undefined;
  const days = [...new Set(times.map((t) => t.slice(0, 10)))];
  return timeContext(days, k.lat, k.lon, verein.flugzeiten);
}

function renderCharts() {
  const dayCtx = chartPoints?.length ? contextFor([chartPoints[0].time]) : undefined;
  const forecastCtx = forecastHours ? contextFor(forecastHours.map((h) => h.time)) : undefined;
  for (const box of all('[data-chart]')) {
    const width = box.clientWidth;
    if (width === 0) continue; // closed <details>; the resize observer renders it when it opens
    const kind = box.dataset.chart;
    if (kind === 'forecast') {
      if (forecastHours) box.innerHTML = forecastChartSvg(forecastHours, verein.ampel, width, forecastCtx) + (forecastHours.length ? legendHtml(verein.ampel, { gusts: true }) : '');
      continue;
    }
    if (!chartPoints) continue;
    const pts = chartPoints;
    if (kind === 'wind') box.innerHTML = windChartSvg(pts, verein.ampel, width, dayCtx) + (pts.length ? legendHtml(verein.ampel) : '');
    else if (kind === 'rose') box.innerHTML = windRoseSvg(pts, verein.ampel, Math.min(width, 320)) + (pts.length ? legendHtml(verein.ampel) : '');
    else if (kind === 'temp') box.innerHTML = lineChartSvg(pts, 'tempC', '°C', 'Temperatur', width, dayCtx);
    else if (kind === 'pressure') box.innerHTML = lineChartSvg(pts, 'pressureHpa', 'hPa', 'Luftdruck', width, dayCtx);
    else if (kind === 'table') box.innerHTML = valuesTableHtml(pts);
  }
}

function setupCharts() {
  let frame = 0;
  const widths = new WeakMap<Element, number>();
  const observer = new ResizeObserver((entries) => {
    // re-render only when a box really changed width, not when we replaced its content
    if (!entries.some((e) => widths.get(e.target) !== e.contentRect.width)) return;
    for (const e of entries) widths.set(e.target, e.contentRect.width);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderCharts);
  });
  for (const box of all('[data-chart]')) observer.observe(box);

  // one tooltip for every chart mark that carries data-tip (hover and tap)
  const tipBox = document.createElement('div');
  tipBox.className = 'chart-tip';
  tipBox.hidden = true;
  document.body.append(tipBox);
  let active: Element | null = null;
  let shownAtY = 0;
  const show = (e: PointerEvent, target: Element) => {
    shownAtY = scrollY;
    active?.classList.remove('on');
    active = target;
    target.classList.add('on');
    tipBox.textContent = target.getAttribute('data-tip');
    tipBox.hidden = false;
    const { width, height } = tipBox.getBoundingClientRect();
    const left = Math.min(Math.max(8, e.clientX - width / 2), innerWidth - width - 8);
    const top = e.clientY - height - 14 < 8 ? e.clientY + 18 : e.clientY - height - 14;
    tipBox.style.left = `${left}px`;
    tipBox.style.top = `${top}px`;
  };
  const hide = () => {
    active?.classList.remove('on');
    active = null;
    tipBox.hidden = true;
  };
  const onPointer = (e: PointerEvent) => {
    const target = (e.target as Element).closest?.('[data-tip]');
    if (target) show(e, target);
    else if (e.type === 'pointerdown' || e.pointerType === 'mouse') hide();
  };
  document.addEventListener('pointermove', onPointer);
  document.addEventListener('pointerdown', onPointer);
  // scroll events arrive a frame late; only hide once the page really moved under the tooltip
  addEventListener('scroll', () => { if (active && scrollY !== shownAtY) hide(); }, { passive: true });
}

// compass in the hero tile: needle turns to where the wind comes from
function setCompass(c: Point | null) {
  const calm = c !== null && c.windKmh === 0;
  for (const svg of all<SVGElement>('[data-live="compass"]')) {
    svg.setAttribute('aria-label', !c ? 'Keine Winddaten' : calm ? 'Windstill' : `Wind ${c.windKmh} km/h aus ${c.windDir}`);
  }
  // <svg> elements have no .hidden property, so toggle the attribute
  for (const needle of all<SVGElement>('[data-live="needle"]')) {
    needle.toggleAttribute('hidden', !c || calm);
    if (!c || calm) continue;
    // turn the short way round: 350° -> 10° is +20°, not -340°
    const prev = Number(needle.dataset.angle ?? c.windDeg);
    const angle = prev + (((((c.windDeg - prev) % 360) + 540) % 360) - 180);
    needle.dataset.angle = String(angle);
    needle.style.transform = `rotate(${angle}deg)`;
  }
  setText('dir-long', !c ? '–' : calm ? 'windstill' : `aus ${c.windDir}`);
}

function clearValues() {
  for (const name of ['wind', 'dir', 'temp', 'pressure']) setText(name, '–');
  setCompass(null);
  setText('time', '');
  setText('peak', '');
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(RELAY + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function renderWeather(w: WeatherResponse) {
  const c = w.current;
  const fromToday = c !== null && isToday(c.time, Date.now());
  chartPoints = fromToday ? w.today : [];
  renderCharts();
  if (!c) {
    clearValues();
    setStatus('off', 'Heute noch keine Messwerte');
    return;
  }
  setText('wind', String(c.windKmh));
  setText('dir', c.windDir);
  setCompass(c);
  setText('temp', String(c.tempC));
  setText('pressure', String(c.pressureHpa));
  if (!fromToday) {
    setText('time', `· Stand ${formatDay(c.time)} ${formatClock(c.time)}`);
    setStatus('off', `Letzter Messwert vom ${formatDay(c.time)} um ${formatClock(c.time)} Uhr`);
    setText('peak', '');
  } else if (w.stale || isOutdated(c.time, Date.now())) {
    setText('time', `· Stand ${formatClock(c.time)}`);
    setStatus('off', `Letzter Messwert um ${formatClock(c.time)} Uhr`);
    setText('peak', '');
  } else {
    setText('time', `· ${formatClock(c.time)}`);
    const peak = recentPeak(w.today, c);
    const a = ampel(peak, verein.ampel);
    setStatus(a.level, a.label);
    setText('peak', `Letzte Stunde bis ${peak} km/h`);
  }
}

let camImages: WebcamResponse['images'] = [];
let camIndex = 0;

function showCam(index: number) {
  const image = camImages[index];
  if (!image) return;
  camIndex = index;
  const img = document.querySelector<HTMLImageElement>('[data-live="lightbox-img"]');
  if (img) {
    img.src = image.url;
    img.alt = `Webcam ${stamp(image.time)} Uhr`;
  }
  setText('lightbox-caption', `Webcam ${stamp(image.time)} Uhr${index === 0 ? ' · neuestes Bild' : ''}`);
  const newer = document.querySelector<HTMLButtonElement>('[data-live="lightbox-newer"]');
  const older = document.querySelector<HTMLButtonElement>('[data-live="lightbox-older"]');
  if (newer) newer.disabled = index === 0;
  if (older) older.disabled = index === camImages.length - 1;
}

function openCam(index: number) {
  const dialog = document.querySelector<HTMLDialogElement>('[data-live="lightbox"]');
  if (!dialog || camImages.length === 0) return;
  showCam(index);
  if (!dialog.open) dialog.showModal();
}

function setupLightbox() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-live="lightbox"]');
  if (!dialog) return;
  document.querySelector('[data-live="lightbox-newer"]')?.addEventListener('click', () => showCam(camIndex - 1));
  document.querySelector('[data-live="lightbox-older"]')?.addEventListener('click', () => showCam(camIndex + 1));
  document.querySelector('[data-live="cam-open"]')?.addEventListener('click', () => openCam(0));
  // click on the backdrop closes
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showCam(camIndex + 1);
    if (e.key === 'ArrowRight') showCam(camIndex - 1);
  });
}

function renderWebcam(w: WebcamResponse) {
  camImages = w.images;
  const latest = w.images[0];
  const hero = document.querySelector<HTMLImageElement>('img[data-live="hero"]');
  if (hero && latest && hero.dataset.current !== latest.url) {
    const probe = new Image();
    probe.onload = () => {
      hero.removeAttribute('srcset');
      hero.removeAttribute('sizes');
      hero.src = latest.url;
      hero.alt = `Webcam am Flugplatz, ${stamp(latest.time)} Uhr`;
      hero.dataset.current = latest.url;
      setText('cam-time', `· ${stamp(latest.time)}`);
      const badge = document.querySelector<HTMLElement>('[data-live="cam-open"]');
      if (badge) badge.hidden = false;
    };
    probe.src = latest.url;
  }
  for (const box of all('[data-live="thumbs"]')) {
    box.replaceChildren(
      ...w.images.slice(0, 6).map((image, i) => {
        const fig = document.createElement('figure');
        const open = document.createElement('button');
        open.type = 'button';
        open.addEventListener('click', () => openCam(i));
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = `Webcam ${stamp(image.time)} Uhr`;
        img.loading = 'lazy';
        const cap = document.createElement('figcaption');
        cap.textContent = stamp(image.time);
        open.append(img);
        fig.append(open, cap);
        return fig;
      }),
    );
  }
}

function showForecast(f: ForecastResponse) {
  forecastHours = upcoming(f.hours, Date.now(), 12);
  setText('forecast-summary', forecastSummary(forecastHours, verein.ampel));
  renderCharts();
}

function forecastDown() {
  forecastHours = null;
  setText('forecast-summary', '');
  setMessage('forecast', 'Prognose gerade nicht verfügbar');
}

function weatherDown() {
  clearValues();
  setStatus('off', 'Wetterdaten gerade nicht verfügbar');
  chartPoints = null;
  for (const name of ['bars', 'rose', 'temp-chart', 'pressure-chart', 'table']) setMessage(name, 'Messwerte gerade nicht verfügbar');
}

const webcamDown = () => setMessage('thumbs', 'Webcam gerade nicht verfügbar');

// each source renders as soon as it arrives: a slow webcam must not hold back the wind values
function refresh() {
  if (!RELAY) {
    weatherDown();
    webcamDown();
    forecastDown();
    return;
  }
  getJson<WeatherResponse>('/weather').then(renderWeather, weatherDown);
  getJson<WebcamResponse>('/webcam').then(renderWebcam, webcamDown);
  getJson<ForecastResponse>('/forecast').then(showForecast, forecastDown);
}

setupLightbox();
setupCharts();
refresh();
setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
