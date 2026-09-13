// Run against tests/preview-server.mjs and a headless Chrome on port 9333.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { codes, upload } from './helpers.mjs';
import settings from '../site-config.json' with { type: 'json' };
import { createDevServer } from '../scripts/dev-server.mjs';
const staticServer = createDevServer();
// Keep the browse-only test local even when production has a configured API.
const staticHandler = staticServer.listeners('request')[0];
staticServer.removeAllListeners('request');
staticServer.on('request', (request, response) => {
  if (request.url === '/site-config.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ...settings, apiBaseUrl: '' }));
  } else staticHandler(request, response);
});
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
  await until(`document.querySelector('#team-title').textContent === "Team Vampire's board" && document.querySelector('#score').textContent.includes('0 / 52')`);
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
  assert.ok((await evaluate(`document.querySelector('#score').textContent`)).includes('0 / 52'));
  await screenshot('submission-pending');
  await evaluate(`document.querySelector('#tile-dialog').close(); document.querySelector('#reviewer-login').click(); document.querySelector('#login-form [name=reviewerId]').value='organiser'; document.querySelector('#login-form [name=code]').value=${JSON.stringify(codes.reviewer)}; document.querySelector('#login-form').requestSubmit()`);
  await until(`document.querySelector('#reviewer-login').textContent.includes('Test Organiser')`);
  await evaluate(`document.querySelector('#history button.evidence').click()`);
  await screenshot('review-evidence');
  await evaluate(`document.querySelector('#review-form').requestSubmit()`);
  await until(`document.querySelector('#score').textContent.includes('1 / 52')`);
  await evaluate(`document.querySelector('[data-team=werewolf]').click()`);
  await until(`document.querySelector('#team-title').textContent === "Team Werewolf's board" && document.querySelector('#score').textContent.includes('0 / 52')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').textContent`), 'Team sign in');
  assert.equal(await evaluate(`document.querySelectorAll('#history .evidence').length`), 0);
  assert.ok((await evaluate('location.search')).includes('team=werewolf'));
  await screenshot('werewolf-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('werewolf-mobile');
  await command('Page.reload');
  await until(`document.querySelector('#team-title').textContent === "Team Werewolf's board" && document.querySelector('#score').textContent.includes('0 / 52')`);
  await evaluate(`document.querySelector('[data-team=vampire]').click()`);
  await until(`document.querySelector('#score').textContent.includes('1 / 52')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').textContent`), 'Team sign out');
  // Bonus quantities accumulate, stay open, and reverse after a reviewer correction.
  const bonusId = 'the-witching-hour';
  for (const quantity of [3, 2]) {
    const body = upload({ tileId: bonusId, choiceId: 'activity-progress', quantity,
      notes: 'Unique obtained at 12:30 AM local time; local browser test.',
      image: { ...upload().image, base64: btoa(atob(upload().image.base64) + String(quantity)) } });
    const result = await fetch('http://127.0.0.1:4173/api/teams/vampire/submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${codes.vampire}` }, body: JSON.stringify(body)
    });
    assert.equal(result.status, 201);
    await evaluate(`document.querySelector('#refresh').click()`);
    await until(`document.querySelector('#history .evidence')?.textContent.includes('The Witching Hour') && document.querySelector('#history .evidence')?.textContent.includes('${quantity} ×')`);
    await evaluate(`document.querySelector('#history .evidence').click()`);
    assert.equal(await evaluate(`document.querySelector('#manual-completion').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#review-form [name=completesTile]').disabled`), true);
    await evaluate(`document.querySelector('#review-form').requestSubmit()`);
    await until(`document.querySelector('#score').textContent.includes('${quantity === 3 ? 3 : 5} bonus points')`);
  }
  await evaluate(`document.querySelector('#tile-select').value='the-witching-hour'; document.querySelector('#tile-select').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#requirements h3').textContent`), '5 bonus points');
  assert.equal(await evaluate(`document.querySelector('#upload-fields').disabled`), false);
  assert.equal(await evaluate(`document.querySelector('#requirements').textContent.includes('Tile complete')`), false);
  const bonusBadge = `Array.from(document.querySelector('#board').contentDocument.querySelectorAll('g.tile')).find(g => g.getAttribute('aria-label').includes('The Witching Hour')).querySelector('.progress-badge').textContent`;
  assert.equal(await evaluate(bonusBadge), '+5 bonus points');
  await screenshot('witching-hour-bonus');
  await evaluate(`document.querySelector('#tile-dialog').close(); document.querySelector('#history .evidence').click(); document.querySelector('#review-form [name=status]').value='rejected'; document.querySelector('#review-form [name=reason]').value='Drop was outside the time window'; document.querySelector('#review-form').requestSubmit()`);
  await until(`document.querySelector('#score').textContent.includes('3 bonus points')`);
  assert.ok((await evaluate(`document.querySelector('#score').textContent`)).includes('1 / 52'));
  await evaluate(`document.querySelector('[data-team=werewolf]').click()`);
  await until(`document.querySelector('#score').textContent.includes('0 / 52') && document.querySelector('#score').textContent.includes('0 bonus points')`);
  await command('Page.navigate', { url: 'http://localhost:4174/?team=werewolf' });
  await until(`document.querySelector('#team-title')?.textContent === "Team Werewolf's board" && document.querySelector('#service-status').textContent.includes('Submissions aren’t open yet')`);
  assert.equal(await evaluate(`document.querySelector('#team-login').disabled`), true);
  await evaluate(`const picker = document.querySelector('#tile-select'); picker.value='the-blood-theatre'; picker.dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#upload-fields').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('#tile-title').textContent`), 'The Blood Theatre');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: upload, pending state, reviewer approval, team isolation, deep link reload, tab sign-in, mobile layout, and browse-only mode.');
} finally { socket.close(); staticServer.close(); await fetch(`http://127.0.0.1:9333/json/close/${page.id}`); }
