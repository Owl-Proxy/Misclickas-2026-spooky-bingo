import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadWithRetries, abortableSleep } from '../web/upload-retry.mjs';
const failure = (status, retryAfter = 0) => Object.assign(new Error('Busy'), { status, retryAfter });
function clock() {
  let elapsed = 0;
  return { now: () => elapsed, random: () => 0, sleep: async ms => { elapsed += ms; }, advance: ms => { elapsed += ms; } };
}
test('normal upload succeeds immediately without a countdown or extra requests', async () => {
  const phases = []; let calls = 0;
  const result = await uploadWithRetries(async () => { calls++; return { status: 'pending' }; }, { ...clock(), onState: state => phases.push(state.phase) });
  assert.equal(result.status, 'pending'); assert.equal(calls, 1); assert.deepEqual(phases, ['sending']);
});
test('rate limited uploads respect the server wait plus jitter and reuse the payload', async () => {
  const timer = clock(), payload = { id: 'unchanged', image: 'same bytes' }, sent = [], phases = [];
  const result = await uploadWithRetries(async () => {
    sent.push({ payload, at: timer.now() }); if (sent.length === 1) throw failure(429, 60); return 'saved';
  }, { ...timer, onState: state => phases.push(state) });
  assert.equal(result, 'saved'); assert.equal(sent[1].at, 61000); assert.equal(sent[0].payload, sent[1].payload);
  assert.equal(phases.find(state => state.phase === 'countdown').seconds, 61);
});
test('retries stop after three retries and preserve the last server error', async () => {
  let calls = 0;
  await assert.rejects(uploadWithRetries(async () => { calls++; throw failure(503, 10); }, clock()), error => error.retryStopped && error.cause.status === 503);
  assert.equal(calls, 4);
});
test('validation and auth failures never retry', async () => {
  for (const status of [400, 401, 403, 409, 413, 415]) {
    let calls = 0;
    await assert.rejects(uploadWithRetries(async () => { calls++; throw failure(status); }, clock()), error => error.status === status);
    assert.equal(calls, 1);
  }
});
test('long server waits stop immediately rather than retrying early', async () => {
  let calls = 0;
  await assert.rejects(uploadWithRetries(async () => { calls++; throw failure(429, 3600); }, clock()), error => error.retryStopped);
  assert.equal(calls, 1);
});
test('a sleeping/background tab cannot restart uploads after the five minute deadline', async () => {
  const timer = clock(); let calls = 0;
  await assert.rejects(uploadWithRetries(async () => { calls++; throw failure(503); }, { ...timer, sleep: async () => { timer.advance(301000); } }), error => error.retryStopped);
  assert.equal(calls, 1);
});
test('cancellation during countdown prevents any further send', async () => {
  const timer = clock(), controller = new AbortController(); let calls = 0;
  await assert.rejects(uploadWithRetries(async () => { calls++; throw failure(503); }, {
    ...timer, signal: controller.signal, sleep: async ms => { timer.advance(ms); controller.abort(); }
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('network ambiguity retries the same send; cancellation during a request does not', async () => {
  let calls = 0;
  assert.equal(await uploadWithRetries(async () => { calls++; if (calls === 1) throw Object.assign(new Error('Network'), { transient: true }); return 'confirmed'; }, clock()), 'confirmed');
  const controller = new AbortController(); calls = 0;
  await assert.rejects(uploadWithRetries(async () => { calls++; controller.abort(); throw Object.assign(new Error('Network'), { transient: true }); }, { ...clock(), signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('the remaining total budget bounds each request timeout', async () => {
  const timer = clock(); let calls = 0;
  await uploadWithRetries(async ({ timeoutMs }) => {
    calls++;
    if (calls === 1) { assert.equal(timeoutMs, 45000); timer.advance(270000); throw failure(503); }
    assert.equal(timeoutMs, 24000); return 'ok';
  }, timer);
});
test('real countdown timer rejects promptly when cancelled', async () => {
  const controller = new AbortController(); const waiting = abortableSleep(60000, controller.signal);
  controller.abort(); await assert.rejects(waiting, { name: 'AbortError' });
});
