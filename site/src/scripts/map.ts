// Leaflet (~150 KB) is fetched only when the map comes near the viewport
type Leaflet = typeof import('leaflet');

const HINT_MS = 1500;

function init(L: Leaflet, box: HTMLElement) {
  const lat = Number(box.dataset.lat);
  const lon = Number(box.dataset.lon);
  const touch = matchMedia('(pointer: coarse)').matches;
  // page scroll wins: wheel zooms only with Ctrl/⌘, touch pans only with two fingers
  const map = L.map(box, { scrollWheelZoom: false, dragging: !touch, tap: false } as L.MapOptions).setView([lat, lon], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.marker([lat, lon], {
    icon: L.divIcon({ className: 'map-pin', iconSize: [28, 28], iconAnchor: [14, 28] }),
    alt: 'Flugplatz',
  }).addTo(map);

  const hint = box.parentElement?.querySelector<HTMLElement>('[data-map-hint]');
  let timer = 0;
  const showHint = (text: string) => {
    if (!hint) return;
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => { hint.hidden = true; }, HINT_MS);
  };

  box.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) {
      showHint(/Mac/.test(navigator.platform) ? '⌘ + Scrollen zum Zoomen' : 'Strg + Scrollen zum Zoomen');
      return;
    }
    e.preventDefault();
    const point = map.mouseEventToContainerPoint(e);
    map.setZoomAround(point, map.getZoom() + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  if (touch) {
    box.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) map.dragging.enable();
    }, { passive: true });
    box.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) showHint('Zwei Finger zum Bewegen der Karte');
    }, { passive: true });
    box.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) map.dragging.disable();
    }, { passive: true });
  }
}

// as a URL: a plain CSS import would be linked render-blocking into every page head
async function loadCss() {
  const { default: href } = await import('leaflet/dist/leaflet.css?url');
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
  await new Promise((done) => {
    link.onload = link.onerror = done;
    document.head.append(link);
  });
}

// load tiles only once the map scrolls into view
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    Promise.all([import('leaflet'), loadCss()]).then(([{ default: L }]) => init(L, entry.target as HTMLElement));
  }
}, { rootMargin: '200px' });
for (const box of document.querySelectorAll<HTMLElement>('[data-map]')) observer.observe(box);
