import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressCache } from '../worker/progress-cache.mjs';
import { createApp } from '../worker/index.mjs';
import { MemoryStore, env, codes, upload } from './helpers.mjs';
function cacheFixture() {
  let time = 0;
  const values = new Map();
  const cache = {
    async match(key) { const item = values.get(key); return item && item.until > time ? item.response.clone() : undefined; },
    async put(key, response) { values.set(key, { until: time + 20000, response: response.clone() }); },
    async delete(key) { return values.delete(key); }
  };
  return { cache, now: () => time, advance: ms => { time += ms; } };
}
test('simultaneous readers share one fetch, separate teams stay isolated, expiry reloads', async () => {
  const fixture = cacheFixture(), progress = new ProgressCache(fixture); let calls = 0;
  const read = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 2)); return { teamId: 'vampire', value: calls }; };
  const results = await Promise.all(Array.from({ length: 75 }, () => progress.get('vampire', read)));
  assert.equal(calls, 1); assert.ok(results.every(result => result.value === 1));
  await progress.get('vampire', read); assert.equal(calls, 1);
  await progress.get('werewolf', read); assert.equal(calls, 2);
  fixture.advance(20001); await progress.get('vampire', read); assert.equal(calls, 3);
});
test('invalidation prevents a delayed old read from refilling the cache', async () => {
  const fixture = cacheFixture(), progress = new ProgressCache(fixture);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const old = progress.get('team', async () => { entered(); await new Promise(resolve => { release = resolve; }); return { revision: 0 }; });
  await started; await progress.invalidate('team');
  await progress.get('team', async () => ({ revision: 1 }));
  release(); await old;
  assert.equal((await progress.get('team', async () => { throw new Error('Should be cached'); })).revision, 1);
});
test('cache failure falls back to source; source errors are not cached', async () => {
  const broken = new ProgressCache({ cache: { match: async () => { throw new Error(); }, put: async () => { throw new Error(); }, delete: async () => { throw new Error(); } } });
  assert.equal((await broken.get('x', async () => ({ ok: true }))).ok, true);
  await broken.invalidate('x');
  const progress = new ProgressCache(cacheFixture());
  await assert.rejects(progress.get('x', async () => { throw new Error('upstream failure'); }));
  assert.equal((await progress.get('x', async () => ({ ok: true }))).ok, true);
});
test('cached progress still requires board access and uploads/reviews invalidate it', async () => {
  const store = new MemoryStore(), app = createApp(() => store, cacheFixture());
  async function call(path, body, extra = {}, locked = false) {
    const response = await app.fetch(new Request('https://local.test' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${codes.vampire}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }), { ...env, BOARD_PUBLIC: locked ? 'false' : 'true' });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call('/teams/vampire')).data.submissions.length, 0);
  assert.equal((await call('/teams/vampire', undefined, {}, true)).status, 401);
  const body = upload(); assert.equal((await call('/teams/vampire/submissions', body)).status, 201);
  assert.equal((await call('/teams/vampire')).data.submissions.length, 1);
  assert.equal((await call('/teams/werewolf')).data.submissions.length, 0);
  const reviewPath = `/teams/vampire/submissions/${body.id}/review`, headers = { Authorization: `Bearer ${codes.reviewer}`, 'X-Reviewer-Id': 'organiser' };
  assert.equal((await call(reviewPath, { status: 'approved', revision: 0 }, headers)).status, 200);
  assert.equal((await call('/teams/vampire')).data.submissions[0].status, 'approved');
  assert.equal((await call(reviewPath, { status: 'pending', revision: 0 }, headers)).status, 409);
  assert.equal((await call('/teams/vampire/submissions', body)).status, 200);
  assert.equal((await call('/teams/vampire')).data.submissions.length, 1);
});
