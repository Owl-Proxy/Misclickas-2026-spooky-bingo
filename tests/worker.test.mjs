import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, codes, upload, env } from './helpers.mjs';
import { tileProgress } from '../shared/bingo.mjs';
import { createApp } from '../worker/index.mjs';
import { StorageBusyError } from '../worker/github.mjs';

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

test('bonus submissions stay open, ignore manual completion, and reverse points on review', async () => {
  const { request } = fixture();
  const tile = (await request('/config')).body.tiles.find(t => t.id === 'the-witching-hour');
  const auth = { 'X-Reviewer-Id': 'organiser' };
  const first = upload({ tileId: tile.id, choiceId: 'the-blood-theatre--scythe-of-vitur', quantity: 1 });
  assert.equal((await request('/teams/vampire/submissions', { ...first, quantity: 2 }, codes.vampire)).status, 400);
  assert.equal((await request('/teams/vampire/submissions', { ...first, choiceId: 'activity-progress' }, codes.vampire)).status, 400);
  assert.equal((await request('/teams/vampire/submissions', { ...first, choiceId: 'fists-of-fury--activity-progress' }, codes.vampire)).status, 400);
  assert.equal((await request('/teams/vampire/submissions', first, codes.vampire)).status, 201);
  const duplicate = { ...first, id: crypto.randomUUID(), choiceId: 'the-blood-theatre--justiciar-faceguard' };
  assert.equal((await request('/teams/vampire/submissions', duplicate, codes.vampire)).status, 409);
  const route = `/teams/vampire/submissions/${first.id}/review`;
  assert.equal((await request(route, { status: 'approved', revision: 0, completesTile: true }, codes.reviewer, auth)).status, 200);
  let entries = (await request('/teams/vampire')).body.submissions;
  assert.equal(entries[0].completesTile, false);
  assert.equal(tileProgress(tile, entries).bonusPoints, 1);
  assert.equal((await request('/teams/vampire/submissions', duplicate, codes.vampire)).status, 409);
  // Distinct screenshot after approval must still be accepted.
  const second = upload({ tileId: tile.id, choiceId: 'the-voice-in-the-dark--bellator-vestige', quantity: 1,
    image: { ...first.image, base64: btoa(atob(first.image.base64) + '\0') } });
  assert.equal((await request('/teams/vampire/submissions', second, codes.vampire)).status, 201);
  assert.equal((await request(`/teams/vampire/submissions/${second.id}/review`, { status: 'approved', revision: 0 }, codes.reviewer, auth)).status, 200);
  entries = (await request('/teams/vampire')).body.submissions;
  assert.equal(tileProgress(tile, entries).bonusPoints, 2);
  assert.equal(tileProgress(tile, entries).complete, false);
  assert.equal(tileProgress(tile, (await request('/teams/werewolf')).body.submissions).bonusPoints, 0);
  assert.equal((await request('/teams/vampire/submissions', { ...second, id: crypto.randomUUID() }, codes.vampire)).status, 409);
  assert.equal((await request(route, { status: 'rejected', revision: 1, reason: 'Outside the time window' }, codes.reviewer, auth)).status, 200);
  entries = (await request('/teams/vampire')).body.submissions;
  assert.equal(tileProgress(tile, entries).bonusPoints, 1);
  assert.equal((await request('/teams/vampire/submissions', duplicate, codes.vampire)).status, 201);
  assert.equal((await request(route, { status: 'approved', revision: 2 }, codes.reviewer, auth)).status, 409);
  assert.equal((await request('/teams/werewolf/submissions', first, codes.werewolf)).status, 201);
  // Normal progress and a bonus can share evidence, and remain separate decisions.
  assert.equal((await request('/teams/vampire/submissions', upload({ image: first.image }), codes.vampire)).status, 201);
});

test('concurrent bonus claims for different drops on the same tile reserve one slot', async () => {
  const { request } = fixture();
  const requests = ['scythe-of-vitur', 'justiciar-faceguard'].map(drop => request('/teams/vampire/submissions', upload({ tileId: 'the-witching-hour', choiceId: `the-blood-theatre--${drop}` }), codes.vampire));
  assert.deepEqual((await Promise.all(requests)).map(r => r.status).sort(), [201, 409]);
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
  assert.equal((await app.fetch(new Request('http://localhost/teams/vampire'), { BOARD_PUBLIC: 'true' })).status, 503);
  const request = new Request('http://localhost/auth/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: 'vampire' }) });
  assert.equal((await app.fetch(request, { ...env, AUTH_RATE_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
});

test('storage backpressure provides a retry status and wait duration to browsers', async () => {
  const app = createApp(() => ({ readTeam: async () => { throw new StorageBusyError('Please retry later.', 90); } }));
  const response = await app.fetch(new Request('http://localhost/teams/vampire'), env);
  assert.equal(response.status, 503); assert.equal(response.headers.get('Retry-After'), '90');
  assert.equal((await response.json()).retryAfter, 90);
});
