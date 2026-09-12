// Run against tests/preview-server.mjs and a headless Chrome on port 9333.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { codes } from './helpers.mjs';
import { createDevServer } from '../scripts/dev-server.mjs';
const staticServer = createDevServer();
await new Promise(resolve => staticServer.listen(4174, '127.0.0.1', resolve));
const page = await (await fetch('http://127.0.0.1:9333/json/new?http%3A%2F%2Flocalhost%3A4173%2F%3Fteam%3Dvampire', { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0; const pending = new Map(), errors = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { const callback = pending.get(message.id); pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
};
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  const start = Date.now();
  while (Date.now() - start < 15000) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${expression}`);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(`test-results/${name}.png`, Buffer.from(result.data, 'base64'));
}
try {
  await mkdir('test-results', { recursive: true });
  await command('Runtime.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await until(`document.querySelector('#team-title').textContent === "Team Vampire's board" && document.querySelector('#score').textContent.includes('0 / 53')`);
  await until(`document.querySelector('#board').contentDocument?.querySelectorAll('g.tile[role=button]').length === 54`);
  await evaluate(`document.querySelector('#team-login').click(); document.querySelector('#login-form [name=code]').value = ${JSON.stringify(codes.vampire)}; document.querySelector('#login-form').requestSubmit()`);
  await until(`document.querySelector('#team-login').textContent === 'Team sign out'`);
  await evaluate(`document.querySelector('#board').contentDocument.querySelectorAll('g.tile')[1].dispatchEvent(new MouseEvent('click'))`);
  assert.equal(await evaluate(`document.querySelector('#tile-title').textContent`), 'The Voice in the Dark');
  await evaluate(`(async () => {
    const form = document.querySelector('#upload-form'); form.elements.player.value = 'Browser Tester';
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#302020'; ctx.fillRect(0,0,800,500); ctx.fillStyle = '#f5ddb0'; ctx.font = '30px sans-serif'; ctx.fillText('Local test evidence — Bellator vestige',30,100);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'test-drop.png', {type:'image/png'}));
    form.elements.screenshot.files = transfer.files; form.elements.screenshot.dispatchEvent(new Event('change', {bubbles:true})); form.requestSubmit();
  })()`);
  await until(`document.querySelector('#upload-status').textContent.includes('Screenshot saved')`);
  await until(`document.querySelector('#score').textContent.includes('1 pending')`);
  assert.ok((await evaluate(`document.querySelector('#score').textContent`)).includes('0 / 53'));
  await screenshot('submission-pending');
  await evaluate(`document.querySelector('#tile-dialog').close(); document.querySelector('#reviewer-login').click(); document.querySelector('#login-form [name=reviewerId]').value='organiser'; document.querySelector('#login-form [name=code]').value=${JSON.stringify(codes.reviewer)}; document.querySelector('#login-form').requestSubmit()`);
  await until(`document.querySelector('#reviewer-login').textContent.includes('Test Organiser')`);
  await evaluate(`document.querySelector('#history button.evidence').click()`);
  await screenshot('review-evidence');
  await evaluate(`document.querySelector('#review-form').requestSubmit()`);
  await until(`document.querySelector('#score').textContent.includes('1 / 53')`);
  await evaluate(`document.querySelector('[data-team=werewolf]').click()`);
  await until(`document.querySelector('#team-title').textContent === "Team Werewolf's board" && document.querySelector('#score').textContent.includes('0 / 53')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').textContent`), 'Team sign in');
  assert.equal(await evaluate(`document.querySelectorAll('#history .evidence').length`), 0);
  assert.ok((await evaluate('location.search')).includes('team=werewolf'));
  await screenshot('werewolf-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('werewolf-mobile');
  await command('Page.reload');
  await until(`document.querySelector('#team-title').textContent === "Team Werewolf's board" && document.querySelector('#score').textContent.includes('0 / 53')`);
  await evaluate(`document.querySelector('[data-team=vampire]').click()`);
  await until(`document.querySelector('#score').textContent.includes('1 / 53')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').textContent`), 'Team sign out');
  await command('Page.navigate', { url: 'http://localhost:4174/?team=werewolf' });
  await until(`document.querySelector('#team-title')?.textContent === "Team Werewolf's board" && document.querySelector('#service-status').textContent.includes('Submissions aren’t open yet')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').disabled`), true);
  await evaluate(`const picker = document.querySelector('#tile-select'); picker.value='the-blood-theatre'; picker.dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#upload-fields').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('#tile-title').textContent`), 'The Blood Theatre');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: upload, pending state, reviewer approval, team isolation, deep link reload, tab sign-in, mobile layout, and browse-only mode.');
} finally { socket.close(); staticServer.close(); await fetch(`http://127.0.0.1:9333/json/close/${page.id}`); }
