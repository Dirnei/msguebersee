import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebcam } from '../src/parse-webcam.js';

const BASE = 'https://xn--msg-bersee-deb.de/Programme/';
const fixture = readFileSync(new URL('./fixtures/bildtest_email.html', import.meta.url), 'utf8');

test('parses all images of the real fixture, newest first', () => {
  const images = parseWebcam(fixture, BASE);
  assert.equal(images.length, 24);
  assert.deepEqual(images[0], {
    url: 'https://xn--msg-bersee-deb.de/Programme/bilder/151942.jpg',
    time: '2026-10-15T19:42:00+02:00',
  });
  assert.equal(images.at(-1).time, '2026-10-15T07:35:00+02:00');
});

test('ignores entries with odd file names or broken dates', () => {
  const html = '<FONT SIZE=4>2026-10-15 10:00 -- ../../etc.jpg</FONT>'
    + '<FONT SIZE=4>gestern -- 1.jpg</FONT>'
    + '<FONT SIZE=4>2026-10-15 11:00 -- 151100.jpg</FONT>';
  assert.deepEqual(parseWebcam(html, BASE).map((i) => i.url), [`${BASE}bilder/151100.jpg`]);
});

test('page without images gives empty list', () => {
  assert.deepEqual(parseWebcam('MSG-ÜBERSEE<br>', BASE), []);
});
