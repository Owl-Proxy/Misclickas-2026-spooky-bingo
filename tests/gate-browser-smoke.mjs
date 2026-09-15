// Run preview-server with BOARD_PUBLIC=false and Chrome remote debugging on port 9333.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { codes, upload } from './helpers.mjs';
const page = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map(), errors = [], requests = [];
socket.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id) { const callback = pending.get(data.id); pending.delete(data.id); data.error ? callback.reject(new Error(data.error.message)) : callback.resolve(data.result); }
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
};
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url: 'http://localhost:4173/?team=vampire' });
  await until(`document.querySelector('#gate-form')?.hidden === false`);
  assert.equal(await evaluate(`document.querySelector('#board-app').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('#board').getAttribute('data')`), null);
  assert.equal(requests.some(url => /\/config$|board\.svg|october-bingo|october-osrs|\/app\.mjs/.test(url)), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('test-results/board-gate-mobile.png', Buffer.from(screenshot.data, 'base64'));
  for (const path of ['/october-osrs-bingo.svg', '/october-bingo-ideas.json', '/worker/index.mjs']) assert.equal((await fetch('http://localhost:4173' + path)).status, 404);
  await evaluate(`document.querySelector('#gate-form [name=reviewerId]').value='organiser'; document.querySelector('#gate-form [name=code]').value='wrong'; document.querySelector('#gate-form button').click()`);
  await until(`document.querySelector('#gate-status').textContent.includes('not valid')`);
  assert.equal(await evaluate(`document.querySelector('#board-app').hidden`), true);
  await evaluate(`document.querySelector('#gate-form [name=code]').value=${JSON.stringify(codes.reviewer)}; document.querySelector('#gate-form button').click()`);
  await until(`document.querySelector('#board-app').hidden === false && document.querySelector('#board').contentDocument?.querySelectorAll('g.tile[role=button]').length === 54`);
  // Evidence remains protected, but authenticated organisers can view its image.
  const submission = upload();
  const result = await fetch('http://localhost:4173/api/teams/vampire/submissions', { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${codes.vampire}`,
    'X-Board-Code': codes.reviewer, 'X-Board-Reviewer-Id': 'organiser'
  }, body: JSON.stringify(submission) });
  assert.equal(result.status, 201);
  await evaluate(`document.querySelector('#refresh').click()`);
  await until(`document.querySelector('#history .evidence')`);
  await evaluate(`document.querySelector('#history .evidence').click()`);
  await until(`document.querySelector('#review-image').naturalWidth > 0`);
  await evaluate(`document.querySelector('#review-dialog').close(); document.querySelector('#reviewer-login').click()`);
  await until(`document.querySelector('#gate-form')?.hidden === false && document.querySelector('#board-app')?.hidden === true`);
  assert.equal(await evaluate(`sessionStorage.getItem('bingo-reviewer')`), null);
  assert.deepEqual(errors, []);
  console.log('Locked mobile gate, wrong-code rejection, organiser preview, protected images, direct-link blocking and sign-out passed.');
} finally { await command('Page.close').catch(() => {}); socket.close(); }
