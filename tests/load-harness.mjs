// Offline only: runs the real Worker and GitHubStore against a deterministic GitHub model.
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../worker/index.mjs';
import { GitHubStore } from '../worker/github.mjs';
import { env as fixtureEnv, codes, upload, png } from './helpers.mjs';
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple report label');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class FakeGitHub {
  files = new Map(); revision = 0;
  minutes = new Map();
  metrics = { calls: 0, reads: 0, writes: 0, conflicts: 0, throttled: 0 };
  constructor({ latency = 15, primaryLimit = Infinity, branchConflicts = false, secondaryLimits = false, now = Date.now } = {}) { Object.assign(this, { latency, primaryLimit, branchConflicts, secondaryLimits, now }); }
  async fetch(url, options) {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.github.com') throw new Error('Unexpected transport destination');
    const path = decodeURIComponent(parsed.pathname.split('/contents/')[1]);
    this.metrics.calls++;
    if (this.secondaryLimits) {
      const minute = Math.floor(this.now() / 60000), bucket = this.minutes.get(minute) || { points: 0, writes: 0 };
      this.minutes.set(minute, bucket);
      const write = options.method !== 'GET';
      bucket.points += write ? 5 : 1; if (write) bucket.writes++;
      // Conservative model: every attempted PUT counts, even a conflict.
      if (bucket.points > 900 || bucket.writes > 80) { this.metrics.throttled++; return new Response('', { status: 403, headers: { 'Retry-After': '60' } }); }
    }
    if (this.metrics.calls > this.primaryLimit) { this.metrics.throttled++; return new Response('', { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + 3600) } }); }
    const previousHead = this.revision;
    await sleep(this.latency);
    if (options.method === 'GET') {
      this.metrics.reads++;
      const file = this.files.get(path);
      if (!file) return new Response('', { status: 404 });
      if (options.headers.Accept.includes('raw')) return new Response(Buffer.from(file.content, 'base64'));
      return Response.json(file);
    }
    this.metrics.writes++;
    const body = JSON.parse(options.body), current = this.files.get(path);
    if ((current ? body.sha !== current.sha : Boolean(body.sha)) || (this.branchConflicts && previousHead !== this.revision)) {
      this.metrics.conflicts++; return new Response('', { status: 409 });
    }
    this.files.set(path, { sha: String(++this.revision), content: body.content });
    return Response.json({});
  }
  entries() { return [...this.files.entries()].filter(([path]) => path.endsWith('/index.json')).flatMap(([, file]) => JSON.parse(Buffer.from(file.content, 'base64')).submissions); }
}
// Cache API stand-in, with virtual time for an hour of polling without an hour-long wait.
class FakeCache {
  values = new Map();
  constructor(now) { this.now = now; }
  async match(key) { const item = this.values.get(String(key)); return item && item.until > this.now() ? item.response.clone() : undefined; }
  async put(key, response) { const seconds = Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)?.[1] || 0); this.values.set(String(key), { until: this.now() + seconds * 1000, response: response.clone() }); }
  async delete(key) { return this.values.delete(String(key)); }
}
function rig(options = {}, locations = 1) {
  let time = 0;
  const github = new FakeGitHub({ ...options, now: () => time });
  const apps = Array.from({ length: locations }, () => createApp(e => new GitHubStore(e, (...args) => github.fetch(...args)), { cache: new FakeCache(() => time), now: () => time }));
  const counts = new Map();
  const env = { ...fixtureEnv, GITHUB_OWNER: 'local-test', GITHUB_REPO: 'offline', GITHUB_BRANCH: 'submissions',
    UPLOAD_RATE_LIMIT: { async limit({ key }) { const bucket = `${Math.floor(time / 60000)}:${key}`; const count = (counts.get(bucket) || 0) + 1; counts.set(bucket, count); return { success: count <= 20 }; } }
  };
  async function request(path, body, team = 'vampire', location = 0) {
    const start = performance.now();
    const response = await apps[location % locations].fetch(new Request('https://local-test.invalid' + path, {
      method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${codes[team]}`, ...(team === 'reviewer' ? { 'X-Reviewer-Id': 'organiser' } : {}) } : {},
      body: body ? JSON.stringify(body) : undefined
    }), env);
    return { status: response.status, body: await response.json(), ms: Math.round(performance.now() - start) };
  }
  return { github, request, advance: ms => { time += ms; } };
}
function stats(results) {
  const times = results.map(r => r.ms).sort((a, b) => a - b), statuses = {};
  for (const result of results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  return { requests: results.length, statuses, p95ms: times[Math.ceil(times.length * .95) - 1], maxMs: times.at(-1) };
}
const rows = [];
export { rig, stats, FakeGitHub };
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
for (const viewers of [50, 75]) {
  for (const locations of [1, 5]) {
    const { request, github, advance } = rig({ latency: 1, primaryLimit: 5000 }, locations);
    const results = [];
    for (let round = 0; round < 120; round++) {
      results.push(...await Promise.all(Array.from({ length: viewers }, (_, i) => request('/teams/' + (i % 2 ? 'vampire' : 'werewolf'), undefined, undefined, i))));
      advance(30000);
    }
    const row = { scenario: `${viewers} viewers / 1 virtual hour / ${locations} locations`, ...stats(results), ...github.metrics }; rows.push(row); console.log(JSON.stringify(row));
  }
}
for (const [uploads, branchConflicts] of [[5, false], [10, false], [20, false], [20, true], [50, true]]) {
  const { request, github } = rig({ latency: 20, branchConflicts });
  const payloads = Array.from({ length: uploads }, (_, i) => upload({ player: `Tester ${i}`, image: { type: 'image/png', base64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(256 * 1024, i)]).toString('base64') } }));
  const viewers = Array.from({ length: 75 }, (_, i) => request('/teams/' + (i % 2 ? 'vampire' : 'werewolf')));
  const results = await Promise.all(payloads.map((body, i) => request(`/teams/${i % 2 ? 'vampire' : 'werewolf'}/submissions`, body, i % 2 ? 'vampire' : 'werewolf')));
  await Promise.all(viewers);
  const entries = github.entries();
  const acknowledged = new Set(results.flatMap((r, i) => r.status < 300 ? [payloads[i].id] : []));
  const row = { scenario: `${uploads} simultaneous uploads + 75 viewers / ${branchConflicts ? 'branch and file' : 'file'} conflicts`, ...stats(results), ...github.metrics,
    persisted: entries.length, duplicateIds: entries.length - new Set(entries.map(e => e.id)).size, lostAcknowledged: [...acknowledged].filter(id => !entries.some(e => e.id === id)).length,
    orphanImages: [...github.files.keys()].filter(p => !p.endsWith('/index.json')).length - entries.length };
  assert.equal(row.lostAcknowledged, 0, 'A successful response must have a saved entry');
  assert.equal(row.duplicateIds, 0, 'Concurrent saves must not duplicate entries');
  rows.push(row); console.log(JSON.stringify(row));
}
await mkdir('test-results', { recursive: true });
await writeFile(`test-results/load-${label}.json`, JSON.stringify({ label, at: new Date().toISOString(), assumptions: 'Offline Node Worker calls; real GitHubStore; simulated 1ms viewer and 20ms upload API latency; SHA conflicts; optional strict branch-head conflicts; primary quota 5000; exact one-location 20/min/team throttle; 256KiB synthetic PNG payloads. Timings are not Cloudflare/GitHub production capacity.', rows }, null, 2));
}
