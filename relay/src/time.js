const FORMAT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const OFFSET = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });

export function berlinLocalToIso(local) {
  const m = FORMAT.exec(String(local ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // offset at the guessed instant, then re-check at the corrected instant (DST edges)
  const offset = offsetMinutes(asUtc - offsetMinutes(asUtc) * 60_000);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${y}-${mo}-${d}T${h}:${mi}:00${sign}${pad(Math.trunc(abs / 60))}:${pad(abs % 60)}`;
}

function offsetMinutes(timestamp) {
  const name = OFFSET.formatToParts(timestamp).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

function pad(n) {
  return String(n).padStart(2, '0');
}
