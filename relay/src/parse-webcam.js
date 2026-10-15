import { berlinLocalToIso } from './time.js';

const ENTRY = /<FONT[^>]*>\s*([^<]*?)\s*--\s*([\w-]+\.jpe?g)\s*<\/FONT>/gi;

export function parseWebcam(html, upstreamBase) {
  const images = [];
  for (const [, when, file] of String(html).matchAll(ENTRY)) {
    const time = berlinLocalToIso(when);
    if (time) images.push({ url: new URL(`bilder/${file}`, upstreamBase).href, time });
  }
  return images.sort((a, b) => b.time.localeCompare(a.time));
}
