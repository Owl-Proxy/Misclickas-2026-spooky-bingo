import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { rig, stats } from './load-harness.mjs';
import { upload, png } from './helpers.mjs';
const results = [];
for (const [count, locations] of [[20, 1], [75, 1], [20, 5], [75, 5]]) {
  const { github, request, advance } = rig({ latency: 20, branchConflicts: true, secondaryLimits: true }, locations);
  const payloads = Array.from({ length: count }, (_, i) => upload({ player: `Stress ${i}`, image: { type: 'image/png', base64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(256 * 1024, i)]).toString('base64') } }));
  const submit = i => request(`/teams/${i % 2 ? 'vampire' : 'werewolf'}/submissions`, payloads[i], i % 2 ? 'vampire' : 'werewolf', i);
  const first = await Promise.all(payloads.map((_, i) => submit(i)));
  let pending = first.flatMap((r, i) => r.status >= 400 ? [i] : []);
  let rounds = 0;
  while (pending.length && rounds < 4) {
    advance(60001); rounds++;
    const next = [];
    // Model users waiting and retrying; this is deliberately NOT an automatic queue.
    for (const i of pending) { const retry = await submit(i); if (retry.status >= 400) next.push(i); }
    pending = next;
  }
  const entries = github.entries();
  assert.equal(pending.length, 0); assert.equal(entries.length, count); assert.equal(new Set(entries.map(e => e.id)).size, count);
  advance(60001);
  const duplicateRetry = await submit(0); assert.equal(duplicateRetry.status, 200); assert.equal(github.entries().length, count);
  // Simultaneous approvals of different entries must preserve all audit records.
  const reviewed = entries.slice(0, 5);
  const reviews = await Promise.all(reviewed.map(entry => request(`/teams/${entry.teamId}/submissions/${entry.id}/review`, { status: 'approved', revision: 0 }, 'reviewer')));
  assert.ok(reviews.every(r => r.status === 200));
  assert.equal(github.entries().filter(e => e.status === 'approved').length, reviewed.length);
  const row = { scenario: `${count} simultaneous uploads / ${locations} locations with conservative secondary limits`, initial: stats(first), retryWindowsNeeded: rounds, eventualSaved: entries.length, duplicateIds: 0, concurrentReviews: stats(reviews), github: github.metrics };
  results.push(row); console.log(JSON.stringify(row));
}
// Exercise near-maximum payload decoding separately; timings do not measure Workers CPU allowance.
{
  const { request, github } = rig({ latency: 20 });
  const payloads = Array.from({ length: 5 }, (_, i) => upload({ image: { type: 'image/png', base64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(3 * 1024 * 1024 - Buffer.from(png, 'base64').length, i)]).toString('base64') } }));
  const uploads = await Promise.all(payloads.map(body => request('/teams/vampire/submissions', body)));
  assert.ok(uploads.every(r => r.status === 201)); assert.equal(github.entries().length, 5);
  const row = { scenario: '5 simultaneous 3MiB synthetic uploads', ...stats(uploads) }; results.push(row); console.log(JSON.stringify(row));
}
await writeFile('test-results/load-stress.json', JSON.stringify({ assumptions: 'Offline model, conservative 80 PUT attempts/minute and 900 API points/minute. Retry windows are virtual; users retry sequentially after waiting. Synthetic images exercise byte handling, not real image decoding. No live requests.', results }, null, 2));
