import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berlinLocalToIso } from '../src/time.js';

test('summer time gets +02:00', () => {
  assert.equal(berlinLocalToIso('2026-10-15 20:40'), '2026-10-15T20:40:00+02:00');
});

test('winter time gets +01:00', () => {
  assert.equal(berlinLocalToIso('2026-01-15 07:05'), '2026-01-15T07:05:00+01:00');
});

test('surrounding whitespace is ignored', () => {
  assert.equal(berlinLocalToIso('  2026-10-15 00:01 '), '2026-10-15T00:01:00+02:00');
});

test('invalid input returns null', () => {
  for (const bad of ['', 'Datum/Uhrzeit', '2026-10-15', '15.10.2026 20:40', undefined]) {
    assert.equal(berlinLocalToIso(bad), null, String(bad));
  }
});
