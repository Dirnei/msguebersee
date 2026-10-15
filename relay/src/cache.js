export function createCache(load, { ttlMs, retryMs, now = Date.now }) {
  let entry = null; // { value, at }
  let failure = null; // { error, at }
  let inflight = null;

  return async function get() {
    const t = now();
    if (entry && t - entry.at < ttlMs) return { value: entry.value, stale: false };
    if (failure && t - failure.at < retryMs) {
      if (entry) return { value: entry.value, stale: true };
      throw failure.error;
    }
    inflight ??= load()
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
      });
    try {
      return { value: await inflight, stale: false };
    } catch (error) {
      if (entry) return { value: entry.value, stale: true };
      throw error;
    }
  };
}
