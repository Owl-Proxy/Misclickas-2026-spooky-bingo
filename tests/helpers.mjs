import { createApp } from '../worker/index.mjs';
import { readFileSync } from 'node:fs';
export const codes = { vampire: 'test-vampire-code-123456789', werewolf: 'test-werewolf-code-123456789', reviewer: 'test-reviewer-code-123456789' };
export const env = { BOARD_PUBLIC: 'true', BOARD_SVG: readFileSync(new URL('../october-osrs-bingo.svg', import.meta.url), 'utf8'), GITHUB_TOKEN: 'test-only', TEAM_CODES: JSON.stringify({ vampire: codes.vampire, werewolf: codes.werewolf }), REVIEWERS: JSON.stringify({ organiser: { name: 'Test Organiser', code: codes.reviewer } }), ALLOWED_ORIGINS: 'http://localhost:4173' };
export class MemoryStore {
  teams = new Map(); images = new Map();
  async readTeam(id) { return { sha: null, data: structuredClone(this.teams.get(id) || { version: 1, teamId: id, submissions: [] }) }; }
  async updateTeam(id, mutate) {
    // No await between read and write: emulate an atomic successful SHA update.
    const data = structuredClone(this.teams.get(id) || { version: 1, teamId: id, submissions: [] });
    const result = mutate(data); this.teams.set(id, data); return result;
  }
  async putImage(path, bytes) { this.images.set(path, bytes); }
  async readImage(path) { return this.images.get(path); }
}
export const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
export function fixture() {
  const store = new MemoryStore(), app = createApp(() => store);
  const request = async (path, body, code, headers = {}) => {
    const response = await app.fetch(new Request(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(code ? { Authorization: `Bearer ${code}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { store, app, request };
}
export const upload = overrides => ({ id: crypto.randomUUID(), tileId: 'the-blood-theatre', choiceId: 'scythe-of-vitur', quantity: 1, player: 'Spooky Player', notes: '', image: { type: 'image/png', base64: png }, ...overrides });
