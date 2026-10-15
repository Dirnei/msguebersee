export async function fetchText(url, { timeoutMs = 10_000 } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'msg-relay/1.0' },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
