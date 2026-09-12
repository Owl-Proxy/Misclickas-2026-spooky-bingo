import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, codes, upload, env } from './helpers.mjs';
import { tileProgress } from '../shared/bingo.mjs';

test('public catalog has no credentials; team codes cannot cross teams or review', async () => {
  const { request } = fixture();
  const config = await request('/config'); assert.equal(config.status, 200); assert.equal(config.body.ready, true);
  assert.equal(JSON.stringify(config.body).includes(codes.vampire), false);
  assert.equal((await request('/auth/team', { teamId: 'vampire' }, codes.vampire)).status, 200);
  assert.equal((await request('/teams/werewolf/submissions', upload(), codes.vampire)).status, 401);
  const body = upload(); await request('/teams/vampire/submissions', body, codes.vampire);
  assert.equal((await request(`/teams/vampire/submissions/${body.id}/review`, { status: 'approved', revision: 0 }, codes.vampire, { 'X-Reviewer-Id': 'organiser' })).status, 401);
});
test('upload, image retrieval, approval, rejection and audit are isolated by team', async () => {
  const { request, app } = fixture(), body = upload({ status: 'approved', completesTile: true });
  assert.equal((await request('/teams/vampire/submissions', body, codes.vampire)).status, 201);
  let vampire = (await request('/teams/vampire')).body.submissions;
  assert.equal(vampire[0].status, 'pending'); assert.equal(vampire[0].completesTile, false);
  assert.equal('imagePath' in vampire[0], false);
  assert.equal((await request('/teams/werewolf')).body.submissions.length, 0);
  const screenshot = await app.fetch(new Request(`http://localhost/images/vampire/${body.id}`), env);
  assert.equal(screenshot.status, 200); assert.equal(screenshot.headers.get('content-type'), 'image/png');
  assert.equal((await request(`/images/werewolf/${body.id}`)).status, 404);
  const route = `/teams/vampire/submissions/${body.id}/review`, auth = { 'X-Reviewer-Id': 'organiser' };
  assert.equal((await request(route, { status: 'approved', revision: 0, reviewer: 'Forged name' }, codes.reviewer, auth)).status, 200);
  assert.equal((await request(route, { status: 'rejected', revision: 0, reason: 'Stale review' }, codes.reviewer, auth)).status, 409);
  vampire = (await request('/teams/vampire')).body.submissions;
  const tile = (await request('/config')).body.tiles.find(t => t.id === body.tileId);
  assert.equal(tileProgress(tile, vampire).complete, true);
  assert.equal(vampire[0].reviews[0].reviewer, 'Test Organiser');
  assert.equal((await request(route, { status: 'rejected', revision: 1, reason: '' }, codes.reviewer, auth)).status, 400);
  assert.equal((await request(route, { status: 'rejected', revision: 1, reason: 'Wrong event date' }, codes.reviewer, auth)).status, 200);
  vampire = (await request('/teams/vampire')).body.submissions;
  assert.equal(tileProgress(tile, vampire).complete, false); assert.equal(vampire[0].reviews.length, 2);
});
test('retries are idempotent, duplicate screenshots and changed retry payloads fail', async () => {
  const { request, store } = fixture(), body = upload();
  assert.equal((await request('/teams/vampire/submissions', body, codes.vampire)).status, 201);
  assert.equal((await request('/teams/vampire/submissions', body, codes.vampire)).status, 200);
  assert.equal((await request('/teams/vampire/submissions', { ...body, quantity: 2 }, codes.vampire)).status, 409);
  assert.equal((await request('/teams/vampire/submissions', { ...body, id: crypto.randomUUID() }, codes.vampire)).status, 409);
  assert.equal((await request('/teams/vampire')).body.submissions.length, 1); assert.equal(store.images.size, 1);
});
test('concurrent retry with changed payload cannot silently replace evidence', async () => {
  const { request } = fixture(), body = upload();
  const results = await Promise.all([request('/teams/vampire/submissions', body, codes.vampire), request('/teams/vampire/submissions', { ...body, quantity: 2 }, codes.vampire)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal((await request('/teams/vampire')).body.submissions.length, 1);
});
test('reject invalid files, paths, quantities, JSON and website origins', async () => {
  const { request } = fixture();
  for (const overrides of [{ tileId: '../escape' }, { tileId: 'free-space' }, { choiceId: 'made-up-drop' }, { quantity: -1 }, { quantity: 1.5 }, { player: '' }]) {
    assert.equal((await request('/teams/vampire/submissions', upload(overrides), codes.vampire)).status, 400);
  }
  assert.equal((await request('/teams/vampire/submissions', upload({ image: { type: 'image/svg+xml', base64: btoa('<svg xmlns="http://www.w3.org/2000/svg"/>') } }), codes.vampire)).status, 415);
  assert.equal((await request('/auth/team', null, codes.vampire)).status, 400);
  assert.equal((await request('/config', undefined, undefined, { Origin: 'https://unapproved.example' })).status, 403);
  assert.equal((await request('/config', undefined, undefined, { Origin: 'http://localhost:4173' })).headers.get('access-control-allow-origin'), 'http://localhost:4173');
});
test('missing setup fails closed and rate limits are enforced', async () => {
  const { app } = fixture();
  assert.equal((await app.fetch(new Request('http://localhost/teams/vampire'), {})).status, 503);
  const request = new Request('http://localhost/auth/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: 'vampire' }) });
  assert.equal((await app.fetch(request, { ...env, AUTH_RATE_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
});
