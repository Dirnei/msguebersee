import { expect, test } from 'vitest';
import { hide, unhide } from './obfuscate';

test('round trip keeps umlauts and hides the plain value', () => {
  for (const value of ['vorstand@msg-übersee.de', 'https://wa.me/4915100000000?text=Hallo%2C%20ich']) {
    const encoded = hide(value);
    expect(encoded).not.toContain(value);
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(unhide(encoded)).toBe(value);
  }
});
