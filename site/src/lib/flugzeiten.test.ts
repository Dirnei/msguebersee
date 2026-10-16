import { describe, expect, test } from 'vitest';
import { verein } from '../data/verein';
import { berlinClock } from './sun';
import { beschreibung, berlinOffset, easter, tagesart, timeContext } from './flugzeiten';

test.each([[2026, '2026-04-05'], [2027, '2027-03-28'], [2030, '2030-04-21']])('Easter %i', (y, d) => {
  expect(easter(y)).toBe(d);
});

describe('tagesart', () => {
  test.each([
    ['2026-10-16', 'werktags'], // Friday
    ['2026-10-17', 'samstag'],
    ['2026-10-18', 'sonntag'],
    ['2026-10-03', 'sonntag'], // Tag der Deutschen Einheit (a Saturday in 2026)
    ['2026-06-04', 'sonntag'], // Fronleichnam
    ['2026-08-15', 'sonntag'], // Mariä Himmelfahrt
    ['2026-04-06', 'sonntag'], // Ostermontag
    ['2026-12-24', 'werktags'], // Heiligabend is no public holiday
  ])('%s -> %s', (ymd, art) => {
    expect(tagesart(ymd)).toBe(art);
  });
});

test('Flugzeiten text matches what the club published', () => {
  expect(verein.flugzeiten.map(beschreibung)).toEqual([
    ['Mo-So: Sonnenaufgang bis Sonnenuntergang'],
    ['Mo-Sa: 10-12, 14-16 und 17:30-19 Uhr', 'So & Feiertag: 10-12 und 14-17:30 Uhr'],
    ['Mo-Fr: 10-12 und 14-15:30 Uhr', 'Sa: 10-12 Uhr', 'So & Feiertag: kein Flugbetrieb'],
  ]);
});

test('Berlin offset follows summer and winter time', () => {
  expect(berlinOffset('2026-10-16')).toBe('+02:00');
  expect(berlinOffset('2026-12-01')).toBe('+01:00');
});

describe('timeContext', () => {
  const { lat, lon } = verein.koordinaten!;

  test('Sunday: no helicopter, short combustion afternoon, electric from sunrise to sunset', () => {
    const ctx = timeContext(['2026-10-18'], lat, lon, verein.flugzeiten);
    const [elektro, verbrenner, heli] = ctx.rows;
    expect(elektro.windows).toHaveLength(1);
    expect(berlinClock(elektro.windows[0].from)).toBe(berlinClock(ctx.sun[0].rise));
    expect(verbrenner.windows.map((w) => `${berlinClock(w.from)}-${berlinClock(w.to)}`)).toEqual(['10:00-12:00', '14:00-17:30']);
    expect(verbrenner.windows[0].tip).toBe('Verbrennermodelle sonn- & feiertags: 10-12 und 14-17:30 Uhr');
    expect(heli.windows).toEqual([]);
  });

  test('nights run from midnight to sunrise and sunset to midnight', () => {
    const ctx = timeContext(['2026-10-16'], lat, lon, verein.flugzeiten);
    expect(ctx.nights).toHaveLength(2);
    expect(berlinClock(ctx.nights[0][0])).toBe('00:00');
    expect(ctx.nights[0][1]).toBe(ctx.sun[0].rise);
    expect(ctx.nights[1][0]).toBe(ctx.sun[0].set);
  });

  test('two days for a forecast across midnight', () => {
    const ctx = timeContext(['2026-10-16', '2026-10-17'], lat, lon, verein.flugzeiten);
    expect(ctx.sun).toHaveLength(2);
    expect(ctx.rows[2].windows).toHaveLength(3); // Fri 2 + Sat 1
  });
});
