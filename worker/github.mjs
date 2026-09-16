export class StorageBusyError extends Error {
  constructor(message, retryAfter = 10) { super(message); this.retryAfter = retryAfter; }
}
export class GitHubStore {
  constructor(env, transport = fetch, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random } = {}) {
    this.env = env;
    this.sleep = sleep; this.random = random;
    // Keep the native fetch call unbound: Cloudflare rejects a GitHubStore
    // instance as its `this` receiver when fetch is called as a class property.
    this.transport = (...args) => transport(...args);
    this.base = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/`;
  }
  async request(path, method = 'GET', body, raw = false) {
    const url = this.base + path.split('/').map(encodeURIComponent).join('/') + (method === 'GET' ? `?ref=${encodeURIComponent(this.env.GITHUB_BRANCH)}` : '');
    const response = await this.transport(url, { method, headers: {
      Authorization: `Bearer ${this.env.GITHUB_TOKEN}`, 'User-Agent': 'Misclickas-Bingo',
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'
    }, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      const details = response.status === 403 ? await response.clone().json().catch(() => ({})) : {};
      if (response.status === 429 || (response.status === 403 && (response.headers.has('Retry-After') || response.headers.get('X-RateLimit-Remaining') === '0' || /rate limit/i.test(details.message || '')))) {
        const wait = Number(response.headers.get('Retry-After')) || Math.ceil(Number(response.headers.get('X-RateLimit-Reset')) - Date.now() / 1000) || 60;
        throw new StorageBusyError('Submission storage is temporarily rate limited. Keep your screenshot and try again after the wait shown.', Math.min(86400, Math.max(1, wait)));
      }
      const error = new Error('Repository storage is unavailable. Please try again.');
      error.upstreamStatus = response.status;
      throw error;
    }
    return raw ? new Uint8Array(await response.arrayBuffer()) : response.json();
  }
  async conflict(error, attempt) {
    if (![409, 422].includes(error.upstreamStatus)) throw error;
    if (attempt === 7) throw new StorageBusyError('Several submissions are being saved at once. Wait a few seconds, then retry the same submission.');
    // Randomised exponential delay prevents competing writes retrying in lockstep.
    await this.sleep(Math.round((.5 + this.random()) * Math.min(2000, 150 * 2 ** attempt)));
  }
  async readTeam(teamId) {
    const result = await this.request(`submissions/${teamId}/index.json`);
    if (!result) return { sha: null, data: { version: 1, teamId, submissions: [] } };
    const bytes = result.content ? Uint8Array.from(atob(result.content.replace(/\s/g, '')), c => c.charCodeAt(0))
      : await this.request(`submissions/${teamId}/index.json`, 'GET', undefined, true);
    return { sha: result.sha, data: JSON.parse(new TextDecoder().decode(bytes)) };
  }
  async updateTeam(teamId, mutate) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { sha, data } = await this.readTeam(teamId);
      const result = mutate(data);
      try {
        await this.request(`submissions/${teamId}/index.json`, 'PUT', {
          message: `Update ${teamId} bingo submissions`, branch: this.env.GITHUB_BRANCH,
          content: toBase64(new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n')), ...(sha ? { sha } : {})
        });
        return result;
      } catch (error) {
        await this.conflict(error, attempt);
      }
    }
  }
  async putImage(path, bytes) {
    // UUID + content hash paths make retries immutable. Different image writes
    // can also conflict when their commits update the same branch concurrently.
    for (let attempt = 0; attempt < 8; attempt++) {
      if (await this.request(path)) return;
      try {
        await this.request(path, 'PUT', { message: 'Add bingo screenshot', branch: this.env.GITHUB_BRANCH, content: toBase64(bytes) });
        return;
      } catch (error) {
        await this.conflict(error, attempt);
      }
    }
  }
  async readImage(path) { return this.request(path, 'GET', undefined, true); }
}

export function toBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary);
}
