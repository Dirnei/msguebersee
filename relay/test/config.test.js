import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

test('defaults', () => {
  assert.deepEqual(readConfig({}), {
    port: 8080,
    upstreamBase: 'https://xn--msg-bersee-deb.de/Programme/',
    allowedOrigins: [],
    cacheMs: 300_000,
  });
});

test('reads env and normalises values', () => {
  const c = readConfig({
    PORT: '9000',
    UPSTREAM_BASE: 'http://example.test/x',
    ALLOWED_ORIGINS: 'https://a.github.io, https://msg.example ,',
    CACHE_SECONDS: '60',
  });
  assert.deepEqual(c, {
    port: 9000,
    upstreamBase: 'http://example.test/x/',
    allowedOrigins: ['https://a.github.io', 'https://msg.example'],
    cacheMs: 60_000,
  });
});
