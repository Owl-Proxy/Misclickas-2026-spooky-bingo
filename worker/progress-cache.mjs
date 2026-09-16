// Cache only the read-only progress view. All mutation checks read GitHub afresh.
// Cloudflare's Cache API is per data centre; in-flight sharing is per isolate.
export class ProgressCache {
  constructor({ cache, now = Date.now } = {}) { this.cache = cache; this.now = now; this.pending = new Map(); }
  storage() { return this.cache ?? globalThis.caches?.default; }
  key(request, env, team) {
    const url = new URL(request.url);
    url.pathname = '/_internal/progress-v1/' + [env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH, team].map(encodeURIComponent).join('/');
    url.search = ''; return url.href;
  }
  async get(key, read) {
    const cache = this.storage();
    if (!cache) return read(); // Node tests and local tools without a Cache API.
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = (async () => {
      try {
        const hit = await cache.match(key);
        if (hit) return await hit.json();
      } catch { /* A cache outage must not prevent reading the source. */ }
      const value = { ...await read(), updatedAt: new Date(this.now()).toISOString() };
      // Invalidating a key detaches an older in-flight read so it cannot repopulate the cache.
      if (this.pending.get(key) === pending) {
        try {
          await cache.put(key, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=20' } }));
          if (this.pending.get(key) !== pending) await cache.delete(key);
        } catch {}
      }
      return value;
    })();
    this.pending.set(key, pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
  async invalidate(key) {
    this.pending.delete(key);
    try { await this.storage()?.delete(key); } catch { /* Entries still expire after 20 seconds. */ }
  }
}
