import assert from 'node:assert/strict';
import { codes, upload, png } from './helpers.mjs';
const origin = 'http://127.0.0.1:8788';
const before = await (await fetch('http://127.0.0.1:4175/metrics')).json();
const viewers = await Promise.all(Array.from({ length: 75 }, (_, i) => fetch(origin + '/teams/' + (i % 2 ? 'vampire' : 'werewolf')).then(async r => ({ status: r.status, data: await r.json() }))));
assert.ok(viewers.every(r => r.status === 200));
const after = await (await fetch('http://127.0.0.1:4175/metrics')).json();
assert.ok(after.reads - before.reads <= 4, JSON.stringify(after));
const bodies = Array.from({ length: 20 }, (_, i) => upload({ image: { type: 'image/png', base64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(256 * 1024, i)]).toString('base64') } }));
const responses = await Promise.all(bodies.map((body, i) => {
  const team = i % 2 ? 'vampire' : 'werewolf';
  return fetch(origin + `/teams/${team}/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${codes[team]}` }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json() }));
}));
assert.ok(responses.every(r => r.status === 201), JSON.stringify(responses.filter(r => r.status !== 201)));
const final = await (await fetch('http://127.0.0.1:4175/metrics')).json();
assert.equal(final.saved - before.saved, 20);
console.log(JSON.stringify({ runtime: 'local workerd', viewers: viewers.length, viewerUpstreamReads: after.reads - before.reads, uploadsSaved: 20, metrics: final }));
