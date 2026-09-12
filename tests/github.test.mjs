import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, toBase64 } from '../worker/github.mjs';

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
