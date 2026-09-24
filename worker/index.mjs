import event from '../october-bingo-ideas.json' with { type: 'json' };
import config from '../site-config.json' with { type: 'json' };
import { buildTiles } from '../shared/bingo.mjs';
import { GitHubStore, StorageBusyError } from './github.mjs';
import { handleSignups } from './signups.mjs';
import { handleDraft } from './draft.mjs';
import { ProgressCache } from './progress-cache.mjs';
import { WiseOldMan, TrackingError, trackedTiles } from './wise-old-man.mjs';

const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_IMAGE * 4 / 3) + 16384;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tiles = buildTiles(event).map(tile => ({ ...tile, trackingMetric: trackedTiles[tile.id]?.metric ?? null }));
function checkBonusClaim(tile, submission, entries) {
  if (!tile?.bonus) return;
  const choice = tile.choices.find(choice => choice.id === submission.choiceId);
  if (!choice?.sourceTileId || !tile.sources.some(source => source.id === choice.sourceTileId)) fail(400, 'Select a board tile and one of its listed drops. Older bonus entries must be resubmitted with a board tile.');
  if (submission.quantity !== 1) fail(400, 'Witching Hour awards one bonus point per board tile. Submit one drop.');
  if (entries.some(s => s.id !== submission.id && s.tileId === tile.id && s.status !== 'rejected'
    && tile.choices.find(c => c.id === s.choiceId)?.sourceTileId === choice.sourceTileId)) {
    fail(409, 'This board tile already has a pending or approved Witching Hour claim for your team.');
  }
}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const secrets = (env, name) => { try { return JSON.parse(env[name] || '{}'); } catch { return {}; } };
const ready = env => Boolean(env.GITHUB_TOKEN && env.TEAM_CODES && env.REVIEWERS);

async function equalSecret(actual, expected) {
  if (typeof expected !== 'string' || expected.length < 20 || actual.length > 256) return false;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function authorize(request, env, role, id, boardCode) {
  const token = boardCode ?? request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const account = role === 'team' ? secrets(env, 'TEAM_CODES')[id] : secrets(env, 'REVIEWERS')[id]?.code;
  if (!await equalSecret(token, account)) {
    await limit(env.AUTH_RATE_LIMIT, request.headers.get('CF-Connecting-IP') || 'local');
    fail(401, 'That access code is not valid.');
  }
  return role === 'reviewer' ? { id, name: secrets(env, 'REVIEWERS')[id].name || id } : { id };
}
async function limit(binding, key) {
  if (binding && !(await binding.limit({ key })).success) fail(429, 'Too many attempts. Please wait a minute and try again.');
}
async function readJSON(request, maximum = 16384) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Send a JSON request.');
  if (Number(request.headers.get('Content-Length')) > maximum) fail(413, 'The upload is too large.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'A request body is required.');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); fail(413, 'The upload is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Send a JSON object.');
    return value;
  } catch { fail(400, 'Invalid JSON object.'); }
}
function text(value, label, maximum, required = true) {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) fail(400, `Check ${label}.`);
  return value.trim();
}
function decodeImage(image) {
  if (!image || typeof image.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) fail(400, 'Invalid screenshot.');
  let bytes;
  try { bytes = Uint8Array.from(atob(image.base64), c => c.charCodeAt(0)); } catch { fail(400, 'Invalid screenshot.'); }
  if (bytes.length > MAX_IMAGE) fail(413, 'Screenshots must be 3 MB or smaller.');
  if (bytes.length < 12) fail(400, 'Invalid screenshot.');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  const type = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!type || image.type !== type) fail(415, 'Use a PNG, JPEG, or WebP screenshot.');
  return { bytes, type, extension: png ? 'png' : jpg ? 'jpg' : 'webp' };
}
const hashBytes = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
function present(data) {
  return { teamId: data.teamId, submissions: data.submissions.map(submission => {
    const { imagePath, imageHash, ...publicSubmission } = submission;
    return { ...publicSubmission, imageUrl: `/images/${data.teamId}/${submission.id}` };
  }) };
}

export function createApp(storeFactory = env => new GitHubStore(env), cacheOptions = {}, trackingOptions = {}) {
  const progress = new ProgressCache(cacheOptions);
  const tracking = new WiseOldMan(trackingOptions);
  const writes = new Map();
  async function write(env, operation) {
    // Serialise this isolate's branch writes. Other isolates still use SHA checks and backoff.
    // These are active HTTP requests, not a durable/background submission queue.
    const key = JSON.stringify([env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH]);
    const started = Date.now(), previous = writes.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => {
      if (Date.now() - started > 20000) throw new StorageBusyError('There are several saves ahead of yours. Keep this form open and retry shortly.');
      return operation();
    });
    writes.set(key, current);
    try { return await current; }
    finally { if (writes.get(key) === current) writes.delete(key); }
  }
  return { async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
    let response;
    try {
      if (origin && !allowed.includes(origin)) fail(403, 'This website is not allowed to use the submission service.');
      if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
      else {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, '');
        const boardPublic = env.BOARD_PUBLIC === 'true';
        // Signup endpoints and authentication stay available before the reveal.
        if (!boardPublic && (path === '/config' || path === '/board.svg' || path.startsWith('/teams/') || path.startsWith('/images/'))) {
          await authorize(request, env, 'reviewer', request.headers.get('X-Board-Reviewer-Id') || request.headers.get('X-Reviewer-Id') || '', request.headers.get('X-Board-Code'));
        }
        const teamMatch = path.match(/^\/teams\/([a-z0-9-]+)(?:\/submissions(?:\/([a-f0-9-]+)\/review)?)?$/);
        const imageMatch = path.match(/^\/images\/([a-z0-9-]+)\/([a-f0-9-]+)$/);
        const teamId = teamMatch?.[1] ?? imageMatch?.[1];
        if (teamId && !config.teams.some(team => team.id === teamId)) fail(404, 'Team not found.');
        if (path === '/board/status' && request.method === 'GET') response = json({ public: boardPublic });
        else if (path === '/board.svg' && request.method === 'GET') {
          if (!env.BOARD_SVG) fail(503, 'The board image is unavailable.');
          response = new Response(env.BOARD_SVG, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "script-src 'none'" } });
        }
        else if (path === '/config' && request.method === 'GET') response = json({ teams: config.teams, tiles, ready: ready(env), maxImageBytes: MAX_IMAGE, boardPublic });
        else if (path.startsWith('/integrations/wise-old-man/') && request.method === 'GET') {
          await authorize(request, env, 'reviewer', request.headers.get('X-Reviewer-Id') || '');
          const match = path.match(/^\/integrations\/wise-old-man\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
          const trackingTeam = config.teams.find(t => t.id === match?.[1]);
          if (!trackingTeam || !trackedTiles[match?.[2]]) fail(404, 'No tracked activity for this tile.');
          response = json(await tracking.get(config.wiseOldManCompetitionId, trackingTeam, match[2]));
        }
        else if (path === '/draft' || path.startsWith('/draft/')) {
          response = await handleDraft(request, env, path, config.teams, { authorize, limit, readJSON, text, json, fail });
        }
        else if (path === '/signups' || path.startsWith('/signups/')) {
          response = await handleSignups(request, env, path, config.teams, { authorize, limit, readJSON, text, json, fail });
        } else {
          if (!ready(env)) fail(503, 'Submissions are not open yet.');
          const store = storeFactory(env);
          const progressKey = teamId ? progress.key(request, env, teamId) : null;
          const ip = request.headers.get('CF-Connecting-IP') || 'local';
          if (request.method === 'POST' && path.startsWith('/auth/')) await limit(env.AUTH_RATE_LIMIT, ip);
          if (path === '/auth/team' && request.method === 'POST') {
            const body = await readJSON(request);
            if (!config.teams.some(team => team.id === body.teamId)) fail(401, 'That team or code is not valid.');
            await authorize(request, env, 'team', body.teamId);
            response = json({ role: 'team', teamId: body.teamId });
          } else if (path === '/auth/reviewer' && request.method === 'POST') {
            const body = await readJSON(request);
            const reviewer = await authorize(request, env, 'reviewer', text(body.reviewerId, 'reviewer ID', 64));
            response = json({ role: 'reviewer', ...reviewer });
          } else if (teamMatch && request.method === 'GET' && path === `/teams/${teamId}`) {
            response = json(await progress.get(progressKey, async () => present((await store.readTeam(teamId)).data)));
          } else if (teamMatch && request.method === 'POST' && path === `/teams/${teamId}/submissions`) {
            await authorize(request, env, 'team', teamId);
            await limit(env.UPLOAD_RATE_LIMIT, teamId);
            const body = await readJSON(request, MAX_BODY);
            if (typeof body.id !== 'string' || !uuid.test(body.id)) fail(400, 'Invalid submission ID.');
            const tile = tiles.find(tile => tile.id === body.tileId && !tile.free);
            if (!tile || !tile.choices.some(choice => choice.id === body.choiceId)) fail(400, 'Select a valid tile and drop.');
            if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 10000) fail(400, 'Quantity must be between 1 and 10,000.');
            if (tile.bonus && body.quantity !== 1) fail(400, 'Witching Hour awards one bonus point per board tile. Submit one drop.');
            const player = text(body.player, 'RuneScape name', 32);
            const notes = text(body.notes ?? '', 'notes', 500, false);
            const { bytes, type, extension } = decodeImage(body.image);
            const imageHash = await hashBytes(bytes);
            const imagePath = `submissions/${teamId}/${tile.id}/${body.id}-${imageHash}.${extension}`;
            const snapshot = (await store.readTeam(teamId)).data;
            const matches = s => s.imageHash === imageHash && s.tileId === tile.id && s.choiceId === body.choiceId && s.quantity === body.quantity && s.player === player && s.notes === notes;
            const checkNew = data => {
              checkBonusClaim(tile, body, data.submissions);
              if (data.submissions.length >= 1500) fail(409, 'This team archive is full. Contact an organiser.');
              if (data.submissions.some(s => s.tileId === tile.id && s.choiceId === body.choiceId && s.imageHash === imageHash && s.status !== 'rejected')) fail(409, 'That screenshot is already submitted for this drop.');
            };
            const existing = snapshot.submissions.find(s => s.id === body.id);
            if (existing) {
              if (!matches(existing)) fail(409, 'This submission ID is already in use.');
              response = json({ id: existing.id, status: existing.status });
            } else {
              const submission = { id: body.id, teamId, tileId: tile.id, choiceId: body.choiceId, quantity: body.quantity, player, notes,
                imagePath, imageHash, imageType: type, createdAt: new Date().toISOString(), status: 'pending', revision: 0, completesTile: false, reviews: [] };
              checkNew(snapshot);
              await write(env, () => store.putImage(imagePath, bytes));
              const saved = await write(env, () => store.updateTeam(teamId, data => {
                const concurrent = data.submissions.find(s => s.id === body.id);
                if (concurrent) {
                  if (!matches(concurrent)) fail(409, 'This submission ID is already in use.');
                  return concurrent;
                }
                checkNew(data);
                data.submissions.push(submission);
                return submission;
              }));
              await progress.invalidate(progressKey);
              response = json({ id: saved.id, status: saved.status }, 201);
            }
          } else if (teamMatch?.[2] && request.method === 'POST') {
            const reviewer = await authorize(request, env, 'reviewer', request.headers.get('X-Reviewer-Id') || '');
            const body = await readJSON(request);
            if (!['approved', 'rejected', 'pending'].includes(body.status) || !Number.isInteger(body.revision)) fail(400, 'Invalid review decision.');
            const reason = text(body.reason ?? '', 'review notes', 500, body.status === 'rejected');
            const result = await write(env, () => store.updateTeam(teamId, data => {
              const submission = data.submissions.find(s => s.id === teamMatch[2]);
              if (!submission) fail(404, 'Submission not found.');
              if (submission.revision !== body.revision) fail(409, 'Another reviewer changed this submission. Refresh before reviewing it.');
              const tile = tiles.find(t => t.id === submission.tileId);
              if (body.status !== 'rejected') checkBonusClaim(tile, submission, data.submissions);
              submission.reviews.push({ reviewerId: reviewer.id, reviewer: reviewer.name, from: submission.status, to: body.status, reason, at: new Date().toISOString() });
              submission.status = body.status;
              submission.completesTile = !tile?.bonus && !tile?.paths && body.status === 'approved' && body.completesTile === true;
              submission.revision++;
              return { id: submission.id, status: submission.status, revision: submission.revision };
            }));
            await progress.invalidate(progressKey);
            response = json(result);
          } else if (imageMatch && request.method === 'GET') {
            const submission = (await store.readTeam(teamId)).data.submissions.find(s => s.id === imageMatch[2]);
            if (!submission) fail(404, 'Screenshot not found.');
            const bytes = await store.readImage(submission.imagePath);
            if (!bytes) fail(404, 'Screenshot not found.');
            response = new Response(bytes, { headers: { 'Content-Type': submission.imageType, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
          } else fail(404, 'Not found.');
        }
      }
    } catch (error) {
      const retryAfter = error instanceof StorageBusyError || error instanceof TrackingError ? error.retryAfter : error instanceof HttpError && error.status === 429 ? 60 : undefined;
      response = json({ error: error instanceof HttpError || error instanceof StorageBusyError || error instanceof TrackingError ? error.message : 'The submission service could not save or load this request. Please try again.', ...(retryAfter ? { retryAfter } : {}) }, error instanceof HttpError ? error.status : error instanceof StorageBusyError || error instanceof TrackingError ? 503 : 502);
      if (retryAfter) response.headers.set('Retry-After', String(retryAfter));
    }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Vary', 'Origin');
    if (origin && allowed.includes(origin)) response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Reviewer-Id, X-Board-Reviewer-Id, X-Board-Code, X-Draft-Team');
    return response;
  } };
}
export default createApp();
