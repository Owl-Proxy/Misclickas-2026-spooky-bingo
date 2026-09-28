// Uses only a local in-memory fixture. Run with test Chrome on debugging port 9333.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createDevServer } from '../scripts/dev-server.mjs';
import { fixture, env } from './helpers.mjs';
const { app } = fixture();
const settings = { ...env, BOARD_PUBLIC: 'false', ALLOWED_ORIGINS: 'http://localhost:4173' };
const server = createDevServer(request => app.fetch(request, settings));
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
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
  for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // A deliberately incorrect browser clock must not reveal the board early.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: 'Date.now = () => 4102444800000;' });
  settings.BOARD_REVEAL_AT = new Date(Date.now() + 14000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  await command('Page.navigate', { url: 'http://localhost:4173/?team=vampire' });
  await until(`document.querySelector('#reveal-countdown')?.hidden === false && Number(document.querySelector('#reveal-seconds').textContent) > 0`);
  assert.equal(await evaluate(`document.querySelector('#board-app').hidden`), true);
  assert.equal(requests.some(url => /\/config$|board\.svg|\/app\.mjs/.test(url)), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const seconds = await evaluate(`Number(document.querySelector('#reveal-seconds').textContent)`);
  await until(`Number(document.querySelector('#reveal-seconds').textContent) < ${seconds - 1}`);
  assert.equal(requests.filter(url => url.endsWith('/board/status')).length, 1, 'Local timer must not poll every second');
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('test-results/reveal-countdown-mobile.png', Buffer.from(screenshot.data, 'base64'));
  await until(`document.querySelector('#board-app').hidden === false && document.querySelector('#board').contentDocument?.querySelectorAll('g.tile[role=button]').length === 54`);
  assert.equal(requests.filter(url => url.endsWith('/board/status')).length, 2);
  assert.equal(await evaluate(`sessionStorage.getItem('bingo-reviewer')`), null);
  assert.deepEqual(errors, []);
  console.log('Mobile countdown, incorrect browser clock, no early spoiler requests, local ticks and automatic public reveal passed.');
} finally {
  await command('Page.close').catch(() => {}); socket.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
