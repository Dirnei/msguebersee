import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/cache.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function loader(results) {
  const calls = { count: 0 };
  const load = async () => {
    const r = results[Math.min(calls.count++, results.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { load, calls };
}

const opts = (c) => ({ ttlMs: 300_000, retryMs: 60_000, now: c.now });

test('serves cached value within ttl', async () => {
  const c = clock();
  const { load, calls } = loader(['a', 'b']);
  const get = createCache(load, opts(c));
  assert.deepEqual(await get(), { value: 'a', stale: false });
  c.advance(299_000);
  assert.deepEqual(await get(), { value: 'a', stale: false });
  assert.equal(calls.count, 1);
});

test('reloads after ttl', async () => {
  const c = clock();
  const { load } = loader(['a', 'b']);
  const get = createCache(load, opts(c));
  await get();
  c.advance(300_000);
  assert.deepEqual(await get(), { value: 'b', stale: false });
});

test('upstream failure serves last value as stale and backs off', async () => {
  const c = clock();
  const { load, calls } = loader(['a', new Error('down'), 'c']);
  const get = createCache(load, opts(c));
  await get();
  c.advance(300_000);
  assert.deepEqual(await get(), { value: 'a', stale: true });
  c.advance(30_000);
  assert.deepEqual(await get(), { value: 'a', stale: true });
  assert.equal(calls.count, 2, 'no retry within retryMs');
  c.advance(30_000);
  assert.deepEqual(await get(), { value: 'c', stale: false });
});

test('failure without any cached value throws, and backs off too', async () => {
  const c = clock();
  const { load, calls } = loader([new Error('down'), 'b']);
  const get = createCache(load, opts(c));
  await assert.rejects(get(), /down/);
  await assert.rejects(get(), /down/);
  assert.equal(calls.count, 1);
  c.advance(60_000);
  assert.deepEqual(await get(), { value: 'b', stale: false });
});

test('concurrent requests share one upstream load', async () => {
  const c = clock();
  const { load, calls } = loader(['a']);
  const get = createCache(load, opts(c));
  const results = await Promise.all([get(), get(), get()]);
  assert.equal(calls.count, 1);
  assert.ok(results.every((r) => r.value === 'a'));
});

test('refresh reloads before expiry so get never waits', async () => {
  const c = clock();
  const { load, calls } = loader(['a', 'b']);
  const get = createCache(load, opts(c));
  assert.equal(await get.refresh(), true);
  c.advance(270_000);
  assert.equal(await get.refresh(), true);
  c.advance(270_000);
  assert.deepEqual(await get(), { value: 'b', stale: false });
  assert.equal(calls.count, 2);
});

test('failed refresh keeps the old value, marked stale once expired', async () => {
  const c = clock();
  const { load } = loader(['a', new Error('down')]);
  const get = createCache(load, opts(c));
  await get.refresh();
  c.advance(270_000);
  assert.equal(await get.refresh(), false);
  assert.deepEqual(await get(), { value: 'a', stale: false });
  c.advance(30_000);
  assert.deepEqual(await get(), { value: 'a', stale: true });
});
