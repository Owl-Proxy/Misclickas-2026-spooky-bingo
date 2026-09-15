// Run with tests/preview-server.mjs and headless Chrome on port 9333. Local fixtures only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { codes } from './helpers.mjs';
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
  for (let count = 0; count < 150; count++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out: ' + expression);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(`test-results/${name}.png`, Buffer.from(result.data, 'base64'));
}
try {
  await mkdir('test-results', { recursive: true });
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://localhost:4173/signup.html' });
  await until(`document.querySelector('#submit-signup')?.disabled === false`);
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate(`Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)`), true);
  await screenshot('signup-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('signup-mobile');
  const player = 'Owl ' + String(Date.now()).slice(-7);
  await evaluate(`document.querySelector('#player').value = ${JSON.stringify(player)}; document.querySelector('#discord').value = 'signup.tester'; document.querySelector('[name=consent]').checked = true; document.querySelector('#submit-signup').click()`);
  await until(`document.querySelector('#signup-form').hidden`);
  assert.match(await evaluate(`document.querySelector('#signup-message').textContent`), /received/);
  assert.equal(requests.some(url => /\/api\/config|october-bingo|october-osrs/.test(url)), false, 'signup must not fetch board details');
  await command('Page.navigate', { url: 'http://localhost:4173/roster.html' });
  await until(`document.querySelector('#login-form')`);
  assert.equal(await evaluate(`document.querySelector('#roster').textContent`), '');
  await evaluate(`document.querySelector('#reviewer-id').value = 'organiser'; document.querySelector('#reviewer-code').value = ${JSON.stringify(codes.reviewer)}; document.querySelector('#login-form button').click()`);
  await until(`!document.querySelector('#roster-panel').hidden && document.querySelectorAll('.roster-entry').length > 0`);
  await evaluate(`document.querySelector('#search').value = ${JSON.stringify(player)}; document.querySelector('#search').dispatchEvent(new Event('input'))`);
  await evaluate(`const select = document.querySelector('.roster-entry select'); select.value = 'vampire'; select.dispatchEvent(new Event('change')); document.querySelector('.roster-entry input[type=checkbox]').checked = true; document.querySelector('.roster-entry button').click()`);
  await until(`document.querySelector('#roster-message').textContent.startsWith('Saved assignment')`);
  await evaluate(`document.querySelector('#refresh').click()`);
  await until(`document.querySelector('#roster-message').textContent === 'Signups are open.'`);
  assert.equal(await evaluate(`document.querySelector('.roster-entry select').value`), 'vampire');
  assert.equal(await evaluate(`document.querySelector('.roster-entry input[type=checkbox]').checked`), true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await screenshot('signup-roster');
  await evaluate(`document.querySelector('#signout').click()`);
  assert.equal(await evaluate(`document.querySelector('#roster').textContent`), '');
  assert.equal(await evaluate(`JSON.stringify(localStorage).includes('signup.tester') || JSON.stringify(sessionStorage).includes('signup.tester')`), false);
  assert.deepEqual(errors, []);
  console.log('Signup desktop/mobile, private roster, team assignment persistence and sign-out passed.');
} finally { await command('Page.close').catch(() => {}); socket.close(); }
