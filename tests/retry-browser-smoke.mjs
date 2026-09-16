// Uses the local preview and Chrome on port 9333; injects failures only in the test tab.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { codes } from './helpers.mjs';
const page = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map(), errors = [];
socket.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id) { const callback = pending.get(data.id); pending.delete(data.id); data.error ? callback.reject(new Error(data.error.message)) : callback.resolve(data.result); }
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
};
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out: ' + expression);
}
async function begin(mode) {
  await evaluate(`(async () => {
    window.retryTest.mode = ${JSON.stringify(mode)}; window.retryTest.calls = [];
    document.querySelector('#tile-dialog').close();
    await new Promise(resolve => setTimeout(resolve, 20));
    const picker = document.querySelector('#tile-select'); picker.value = 'the-voice-in-the-dark'; picker.dispatchEvent(new Event('change'));
    const form = document.querySelector('#upload-form'); form.elements.player.value = 'Retry Tester';
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
    const context = canvas.getContext('2d'); context.fillStyle = '#332222'; context.fillRect(0,0,400,200); context.fillStyle = 'white'; context.fillText(String(Date.now()),20,30);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'retry.png', { type: 'image/png' }));
    form.elements.screenshot.files = transfer.files; form.elements.screenshot.dispatchEvent(new Event('change'));
    form.requestSubmit();
  })()`);
}
try {
  await command('Runtime.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url: 'http://localhost:4173/?team=vampire' });
  await until(`document.querySelector('#team-login')?.disabled === false`);
  await evaluate(`document.querySelector('#team-login').click(); document.querySelector('#login-form [name=code]').value=${JSON.stringify(codes.vampire)}; document.querySelector('#login-form').requestSubmit()`);
  await until(`document.querySelector('#team-login').textContent === 'Team sign out'`);
  await evaluate(`window.retryTest = { mode: '', calls: [] };
    const realFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (options?.method === 'POST' && String(url).endsWith('/submissions')) {
        const state = window.retryTest; state.calls.push(options.body);
        if (state.mode === 'unconfirmed' && state.calls.length === 1) return Response.json({});
        if (state.mode === 'permanent') return Response.json({error:'That access code is not valid.'}, {status:401});
        if (state.mode === 'cancel' || state.mode === 'close' || state.mode === 'longwait' || (state.mode === 'busy' && state.calls.length === 1))
          return Response.json({error:'Temporarily busy.', retryAfter:state.mode === 'longwait' ? 3600 : 1}, {status:503});
        if (state.mode === 'lost' && state.calls.length === 1) { await realFetch(url, options); throw new TypeError('Simulated lost confirmation'); }
      }
      return realFetch(url, options);
    };`);
  await begin('busy');
  await until(`document.querySelector('#upload-countdown').hidden === false`);
  assert.equal(await evaluate(`document.querySelector('#upload-fields').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('#stop-upload-retries').disabled`), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate(`document.querySelector('#upload-countdown').scrollIntoView({block:'center'})`);
  const screenshot = await command('Page.captureScreenshot', {format:'png'});
  await writeFile('test-results/upload-countdown.png', Buffer.from(screenshot.data, 'base64'));
  await until(`document.querySelector('#upload-status').textContent.includes('Screenshot saved')`);
  let bodies = await evaluate(`window.retryTest.calls`);
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  // Simulate a save whose acknowledgement was lost: retry must find the same entry.
  await begin('lost');
  await until(`document.querySelector('#upload-status').textContent.includes('Screenshot saved')`);
  bodies = await evaluate(`window.retryTest.calls`); assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  const id = JSON.parse(bodies[0]).id;
  const archive = await (await fetch('http://localhost:4173/api/teams/vampire')).json();
  assert.equal(archive.submissions.filter(s => s.id === id).length, 1);
  await begin('unconfirmed');
  await until(`document.querySelector('#upload-countdown').hidden === false`);
  assert.equal(await evaluate(`document.querySelector('#upload-status').textContent.includes('Screenshot saved')`), false);
  await until(`document.querySelector('#upload-status').textContent.includes('Screenshot saved')`);
  bodies = await evaluate(`window.retryTest.calls`); assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  await begin('cancel'); await until(`document.querySelector('#upload-countdown').hidden === false`);
  await evaluate(`document.querySelector('#stop-upload-retries').click()`);
  await until(`document.querySelector('#upload-fields').disabled === false`);
  assert.match(await evaluate(`document.querySelector('#upload-status').textContent`), /stopped/);
  assert.equal(await evaluate(`document.querySelector('#upload-form [name=screenshot]').files.length`), 1);
  await begin('close'); await until(`document.querySelector('#upload-countdown').hidden === false`);
  await evaluate(`document.querySelector('#tile-dialog').close()`);
  await new Promise(resolve => setTimeout(resolve, 10500));
  assert.equal(await evaluate(`window.retryTest.calls.length`), 1);
  await new Promise(resolve => setTimeout(resolve, 10500));
  assert.equal(await evaluate(`window.retryTest.calls.length`), 1);
  await begin('permanent');
  await until(`document.querySelector('#upload-status').textContent.includes('not valid')`);
  assert.equal(await evaluate(`document.querySelector('#upload-countdown').hidden`), true);
  assert.equal(await evaluate(`window.retryTest.calls.length`), 1);
  await begin('longwait');
  await until(`document.querySelector('#upload-status').textContent.includes('Automatic retries stopped')`);
  assert.equal(await evaluate(`window.retryTest.calls.length`), 1);
  assert.equal(await evaluate(`document.querySelector('#upload-form [name=screenshot]').files.length`), 1);
  assert.deepEqual(errors, []);
  console.log('Browser retry tests passed: countdown, identical payloads, lost confirmation without duplicates, cancellation, permanent failures and long waits.');
} finally { await command('Page.close').catch(() => {}); socket.close(); }
