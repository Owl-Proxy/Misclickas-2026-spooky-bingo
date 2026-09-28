import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, env, codes } from './helpers.mjs';
import { publicFiles } from '../scripts/public-files.mjs';
import { boardAccess } from '../worker/board-access.mjs';
const reviewerHeaders = { Authorization: `Bearer ${codes.reviewer}`, 'X-Reviewer-Id': 'organiser' };
test('unrevealed boards reject public and team access to every spoiler endpoint', async () => {
  const { app } = fixture();
  for (const mode of [undefined, 'false', 'TRUE']) {
    const locked = { ...env, BOARD_PUBLIC: mode };
    for (const path of ['/config', '/board.svg', '/teams/vampire', '/images/vampire/123']) {
      for (const headers of [{}, { Authorization: `Bearer ${codes.vampire}` }]) {
        const response = await app.fetch(new Request('https://local.test' + path, { headers }), locked);
        assert.equal(response.status, 401, path);
        const body = await response.text();
        assert.equal(body.includes('Bellator'), false); assert.equal(body.includes('<svg'), false);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
      }
    }
    const status = await app.fetch(new Request('https://local.test/board/status'), locked);
    const access = await status.json();
    assert.equal(access.public, false); assert.equal(access.revealAt, null);
    assert.ok(Number.isFinite(Date.parse(access.serverTime)));
  }
});

test('scheduled reveal opens exactly at noon Eastern, independent of browser time', () => {
  const settings = { BOARD_PUBLIC: 'false', BOARD_REVEAL_AT: '2026-09-28T12:00:00-04:00' };
  const reveal = Date.parse('2026-09-28T16:00:00Z');
  assert.equal(boardAccess(settings, reveal - 1).public, false);
  assert.equal(boardAccess(settings, reveal).public, true);
  assert.equal(boardAccess(settings, reveal + 86400000).public, true);
  assert.equal(boardAccess(settings, reveal).revealAt, '2026-09-28T16:00:00.000Z');
  for (const value of [undefined, '', 'invalid', '2026-09-28T12:00:00']) {
    assert.equal(boardAccess({ BOARD_REVEAL_AT: value }, reveal).public, false);
  }
  assert.equal(boardAccess({ ...settings, BOARD_PUBLIC: 'true' }, reveal - 1).public, true);
});

test('scheduled gate protects every spoiler route before reveal and opens public reads afterward', async () => {
  const { app } = fixture();
  for (const [date, isPublic] of [['2099-09-28T12:00:00-04:00', false], ['2000-09-28T12:00:00-04:00', true]]) {
    const scheduled = { ...env, BOARD_PUBLIC: 'false', BOARD_REVEAL_AT: date };
    for (const path of ['/config', '/board.svg', '/teams/vampire', '/images/vampire/123']) {
      const response = await app.fetch(new Request('https://local.test' + path), scheduled);
      assert.equal(response.status, isPublic ? (path.startsWith('/images/') ? 404 : 200) : 401, path);
    }
    const status = await app.fetch(new Request('https://local.test/board/status'), scheduled);
    assert.equal((await status.json()).public, isPublic);
    const upload = await app.fetch(new Request('https://local.test/teams/vampire/submissions', { method: 'POST' }), scheduled);
    assert.equal(upload.status, 401, 'Reveal must not bypass submission authentication');
  }
});
test('reviewer can preview locked SVG and data; explicit reveal restores public access', async () => {
  const { app } = fixture();
  for (const [mode, headers] of [['false', reviewerHeaders], ['true', {}]]) {
    const settings = { ...env, BOARD_PUBLIC: mode };
    const config = await app.fetch(new Request('https://local.test/config', { headers }), settings);
    assert.equal(config.status, 200); assert.equal((await config.json()).tiles.length, 54);
    const svg = await app.fetch(new Request('https://local.test/board.svg', { headers }), settings);
    assert.equal(svg.status, 200); assert.match(await svg.text(), /<svg/);
    assert.equal(svg.headers.get('Content-Type'), 'image/svg+xml');
  }
});
test('board preview credentials are independent of team submission credentials', async () => {
  const { app } = fixture();
  const response = await app.fetch(new Request('https://local.test/teams/vampire', { headers: {
    Authorization: `Bearer ${codes.vampire}`, 'X-Board-Code': codes.reviewer, 'X-Board-Reviewer-Id': 'organiser'
  } }), { ...env, BOARD_PUBLIC: 'false' });
  assert.equal(response.status, 200);
  const status = await app.fetch(new Request('https://local.test/signups/status'), { ...env, BOARD_PUBLIC: 'false' });
  assert.equal(status.status, 200);
});
test('Pages allowlist excludes board exports, event data, promotions and source documentation', () => {
  for (const path of ['october-osrs-bingo.svg', 'october-bingo-ideas.json', 'README.md', 'worker/index.mjs', 'assets/royal-titans.png']) assert.equal(publicFiles.includes(path), false);
  for (const path of ['index.html', 'signup.html', 'roster.html', 'web/board-gate.mjs']) assert.ok(publicFiles.includes(path));
});
