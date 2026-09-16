import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, StorageBusyError, toBase64 } from '../worker/github.mjs';

test('network transport is called without the store as its receiver', async () => {
  const store = new GitHubStore({ GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'submissions' }, async function () {
    // Native fetch in Cloudflare throws "Illegal invocation" for a foreign this.
    assert.equal(this, undefined);
    return new Response('', { status: 404 });
  });
  assert.deepEqual((await store.readTeam('vampire')).data, { version: 1, teamId: 'vampire', submissions: [] });
});

test('SHA conflict retries against fresh data without losing another submission', async () => {
  let state = { version: 1, teamId: 'vampire', submissions: [] }, revision = 1, puts = 0;
  const store = new GitHubStore({ GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_BRANCH: 'submissions', GITHUB_TOKEN: 'private-token' }, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    if (options.method === 'GET') { assert.ok(url.endsWith('?ref=submissions')); return Response.json({ sha: String(revision), content: toBase64(new TextEncoder().encode(JSON.stringify(state))) }); }
    const body = JSON.parse(options.body); assert.equal(body.branch, 'submissions'); puts++;
    if (puts === 1) { state.submissions.push({ id: 'another-player' }); revision++; return new Response('', { status: 409 }); }
    assert.equal(body.sha, String(revision)); state = JSON.parse(atob(body.content)); return Response.json({});
  });
  await store.updateTeam('vampire', data => data.submissions.push({ id: 'my-upload' }));
  assert.deepEqual(state.submissions.map(s => s.id), ['another-player', 'my-upload']); assert.equal(puts, 2);
});
test('large metadata files fall back to raw content; upstream failure is not an empty team', async () => {
  const config = { GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'submissions' };
  let calls = 0;
  const store = new GitHubStore(config, async (url, options) => { calls++; return options.headers.Accept.includes('raw') ? new Response(JSON.stringify({ teamId: 'vampire', submissions: [{ id: 'old' }] })) : Response.json({ sha: 'abc', content: '', encoding: 'none' }); });
  assert.equal((await store.readTeam('vampire')).data.submissions[0].id, 'old'); assert.equal(calls, 2);
  const failing = new GitHubStore(config, async () => new Response('', { status: 403 }));
  await assert.rejects(() => failing.readTeam('vampire'), /unavailable/);
});
test('image writes retry a concurrent branch conflict without overwriting files', async () => {
  let puts = 0;
  const store = new GitHubStore({ GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'submissions' }, async (url, options) => {
    if (options.method === 'GET') return new Response('', { status: 404 });
    puts++;
    assert.equal('sha' in JSON.parse(options.body), false);
    return puts === 1 ? new Response('', { status: 409 }) : Response.json({});
  });
  await store.putImage('submissions/vampire/tile/uuid-hash.png', new Uint8Array([1, 2, 3]));
  assert.equal(puts, 2);
});

test('persistent conflicts use bounded staggered retries then return a retryable error', async () => {
  const delays = []; let puts = 0;
  const store = new GitHubStore({}, async (url, options) => {
    if (options.method === 'GET') return new Response('', { status: 404 });
    puts++; return new Response('', { status: 409 });
  }, { sleep: async ms => { delays.push(ms); }, random: () => .5 });
  await assert.rejects(store.putImage('test.png', new Uint8Array([1])), error => error instanceof StorageBusyError && error.retryAfter === 10);
  assert.equal(puts, 8); assert.deepEqual(delays, [150, 300, 600, 1200, 2000, 2000, 2000]);
});

test('upstream throttling respects the indicated wait instead of automatic write retries', async () => {
  let calls = 0;
  const store = new GitHubStore({}, async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '90' } }); });
  await assert.rejects(store.putImage('test.png', new Uint8Array([1])), error => error instanceof StorageBusyError && error.retryAfter === 90);
  assert.equal(calls, 1);
});
