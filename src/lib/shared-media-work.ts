// Cache decoded/uploaded variants, not blobs or bitmaps. Each canvas scope owns
// its own instance, so changing accounts/projects cannot reuse private results.
export function createSharedMediaWork(limit = 64, ttlMs = 5 * 60_000) {
  const entries = new Map<string, {promise: Promise<unknown>; expires: number; pending: boolean}>();
  return {
    run<T>(key: string, work: () => Promise<T>): Promise<T> {
      const prior = entries.get(key);
      if (prior && (prior.pending || prior.expires > Date.now())) {
        entries.delete(key); entries.set(key, prior);
        return prior.promise as Promise<T>;
      }
      const entry = {promise: Promise.resolve().then(work), expires: 0, pending: true};
      entries.set(key, entry);
      void entry.promise.then(() => {
        entry.pending = false; entry.expires = Date.now() + ttlMs;
        for (const [oldKey, old] of entries) {
          if (entries.size <= limit) break;
          if (!old.pending) entries.delete(oldKey);
        }
      }, () => { if (entries.get(key) === entry) entries.delete(key); });
      return entry.promise;
    },
    size: () => entries.size,
  };
}

export async function mediaWorkKey(kind: string, source: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `${kind}:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
}
