import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index.mjs';
import { codes, env } from './helpers.mjs';
import { signupDatabase } from './signup-db.mjs';
function fixture(t, overrides = {}) {
  const db = signupDatabase(); t.after(() => db.close());
  const settings = { REVIEWERS: env.REVIEWERS, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS, SIGNUPS_DB: db, ...overrides };
  const app = createApp(() => { throw new Error('Signup routes must never use GitHub'); });
  return async (path, body, code, headers = {}) => {
    const response = await app.fetch(new Request('https://example.test' + path, {
      method: body === undefined ? 'GET' : 'POST', headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(code ? { Authorization: `Bearer ${code}`, 'X-Reviewer-Id': 'organiser' } : {}), ...headers
      }, body: body === undefined ? undefined : JSON.stringify(body)
    }), settings);
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
}
const signup = overrides => ({ player: 'Spooky Owl', discord: 'owl.proxy', consent: true, website: '', ...overrides });
test('signup stores private names without GitHub; only reviewers can read the roster', async t => {
  const request = fixture(t);
  assert.deepEqual((await request('/signups/status')).body, { open: true });
  const saved = await request('/signups', signup());
  assert.equal(saved.status, 202); assert.equal(saved.headers.get('Cache-Control'), 'no-store');
  assert.equal(JSON.stringify(saved.body).includes('owl.proxy'), false);
  assert.equal((await request('/signups')).status, 401);
  assert.equal((await request('/signups', undefined, codes.vampire)).status, 401);
  assert.equal((await request('/signups/auth', { reviewerId: 'organiser' }, codes.reviewer)).status, 200);
  const roster = await request('/signups', undefined, codes.reviewer);
  assert.equal(roster.body.signups.length, 1);
  assert.equal(roster.body.signups[0].discord, 'owl.proxy');
});
test('duplicate names and concurrent signup retries preserve the original private details', async t => {
  const request = fixture(t);
  const original = await request('/signups', signup());
  const duplicates = await Promise.all(['SPOOKY_OWL', 'spooky-owl', 'Spooky  Owl'].map(player => request('/signups', signup({ player, discord: 'different.person' }))));
  for (const result of duplicates) { assert.equal(result.status, 202); assert.deepEqual(result.body, original.body); }
  const { body } = await request('/signups', undefined, codes.reviewer);
  assert.equal(body.signups.length, 1); assert.equal(body.signups[0].discord, 'owl.proxy');
});
test('reviewer assignments persist and reject stale writes and invalid teams', async t => {
  const request = fixture(t); await request('/signups', signup());
  const entry = (await request('/signups', undefined, codes.reviewer)).body.signups[0];
  const path = '/signups/' + entry.id;
  const edit = { teamId: 'vampire', roleAssigned: true, revision: 0 };
  assert.equal((await request(path, edit)).status, 401);
  assert.equal((await request(path, { ...edit, teamId: 'unknown' }, codes.reviewer)).status, 400);
  assert.equal((await request(path, { ...edit, teamId: '' }, codes.reviewer)).status, 400);
  assert.equal((await request(path, edit, codes.reviewer)).status, 200);
  assert.equal((await request(path, edit, codes.reviewer)).status, 409);
  const saved = (await request('/signups', undefined, codes.reviewer)).body.signups[0];
  assert.equal(saved.team_id, 'vampire'); assert.equal(saved.role_assigned, 1); assert.equal(saved.revision, 1);
});
test('closed or unconfigured signups fail safely and do not affect reviewer access', async t => {
  const closed = fixture(t, { SIGNUPS_OPEN: 'false' });
  assert.deepEqual((await closed('/signups/status')).body, { open: false });
  assert.equal((await closed('/signups', signup())).status, 503);
  assert.equal((await closed('/signups', undefined, codes.reviewer)).status, 200);
  const unconfigured = fixture(t, { SIGNUPS_DB: undefined });
  assert.deepEqual((await unconfigured('/signups/status')).body, { open: false });
  assert.equal((await unconfigured('/signups', signup())).status, 503);
});
test('validates consent and fields, blocks foreign origins, rate limits and discards honeypots', async t => {
  const request = fixture(t);
  for (const fields of [{ consent: false }, { player: 'waytoolongusername' }, { player: '<script>' }, { discord: '' }, { discord: 'a\nb' }]) {
    assert.equal((await request('/signups', signup(fields))).status, 400);
  }
  assert.equal((await request('/signups', signup(), undefined, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/signups', signup({ website: 'bot' }))).status, 202);
  assert.equal((await request('/signups', undefined, codes.reviewer)).body.signups.length, 0);
  const limited = fixture(t, { SIGNUP_RATE_LIMIT: { limit: async () => ({ success: false }) } });
  assert.equal((await limited('/signups', signup())).status, 429);
});
