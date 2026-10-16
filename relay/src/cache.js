export function createCache(load, { ttlMs, retryMs, now = Date.now }) {
  let entry = null; // { value, at }
  let failure = null; // { error, at }
  let inflight = null;

  // one shared upstream load, however many callers ask at once
  const reload = () =>
    (inflight ??= load()
      .then((value) => {
        entry = { value, at: now() };
        failure = null;
        return value;
      })
      .catch((error) => {
        failure = { error, at: now() };
        throw error;
      })
      .finally(() => {
        inflight = null;
      }));

  async function get() {
    const t = now();
    if (entry && t - entry.at < ttlMs) return { value: entry.value, stale: false };
    if (failure && t - failure.at < retryMs) {
      if (entry) return { value: entry.value, stale: true };
      throw failure.error;
    }
    try {
      return { value: await reload(), stale: false };
    } catch (error) {
      if (entry) return { value: entry.value, stale: true };
      throw error;
    }
  }

  // reload ahead of expiry so no visitor waits for the upstream; failures land in get() as stale
  get.refresh = () => reload().then(() => true, () => false);
  return get;
}
