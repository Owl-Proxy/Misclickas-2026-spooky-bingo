// Run with tests/preview-server.mjs and headless Chrome on port 9333. Local data only.
import assert from 'node:assert/strict';
const tabs=[];
async function tab(path) {
  const info=await(await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();
  const socket=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let next=0;const pending=new Map(),errors=[];
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>reject(Error(method+' timed out')),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{await send('Page.bringToFront');const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+'; '+await run(`JSON.stringify({url:location.href,message:document.querySelector('#draft-message')?.textContent})`)+'; '+JSON.stringify(errors));};
  const result={send,run,until,socket,errors};tabs.push(result);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.practiceRequests=[]; const originalFetch=window.fetch; window.fetch=(...args)=>{window.practiceRequests.push(String(args[0]));return originalFetch(...args);};sessionStorage.setItem('bingo-draft','live-session-sentinel');`});await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:4173/'+path});
  return result;
}

try {
  const page=await tab('draft.html?practice=1');
  await page.until(`document.querySelector('#draft-room')?.hidden===false`);
  assert.equal(await page.run(`document.querySelectorAll('.player-card').length`),36);
  assert.equal(await page.run(`document.querySelector('#practice-panel').hidden`),false);
  await page.run(`document.querySelector('#vampire-captain').value='practice-1';document.querySelector('#werewolf-captain').value='practice-2';document.querySelector('#setup-form').requestSubmit(document.querySelector('#start-draft'));document.querySelector('#confirm-action').click()`);
  await page.until(`document.querySelector('#turn-title').textContent.includes('Team Vampire is choosing')`);
  const switchRole=async role=>{await page.run(`document.querySelector('#practice-role').value=${JSON.stringify(role)};document.querySelector('#practice-role').dispatchEvent(new Event('change'))`);};
  await switchRole('werewolf');
  await page.until(`document.querySelector('#identity').textContent.includes('Werewolf')`);
  assert.equal(await page.run(`document.querySelector('.player-card button').disabled`),true);
  await switchRole('vampire');
  await page.until(`!document.querySelector('.player-card button').disabled`);
  await page.run(`document.querySelector('.player-card button').click();document.querySelector('#confirm-action').click()`);
  await page.until(`document.querySelector('#pick-history').children.length===1`);
  await switchRole('reviewer');
  await page.until(`!document.querySelector('#organiser-controls').hidden`);
  await page.run(`document.querySelector('#undo-pick').click();document.querySelector('#confirm-action').click()`);
  await page.until(`document.querySelector('#turn-title').textContent.includes('paused')`);
  assert.equal(await page.run(`document.querySelectorAll('.player-card').length`),34);
  await page.run(`document.querySelector('#pause-draft').click()`);
  await page.until(`document.querySelector('#turn-title').textContent.includes('Team Vampire is choosing')`);
  assert.deepEqual(await page.run('window.practiceRequests'),[], 'Practice must never fetch configuration or call the Worker');
  assert.equal(await page.run(`sessionStorage.getItem('bingo-draft')`),'live-session-sentinel');
  await page.run(`document.querySelector('#practice-reset').click();document.querySelector('#confirm-action').click()`);
  await page.until(`!document.querySelector('#draft-setup').hidden && document.querySelectorAll('.player-card').length===36`);
  await page.send('Page.reload',{ignoreCache:true});
  await page.until(`document.querySelector('#draft-room')?.hidden===false`);
  assert.equal(await page.run(`document.querySelector('#pick-history').children.length`),0);
  assert.deepEqual(await page.run('window.practiceRequests'),[]);
  assert.equal(await page.run(`sessionStorage.getItem('bingo-draft')`),'live-session-sentinel');
  for(const page of tabs)assert.deepEqual(page.errors,[]);
  console.log('PASS: practice start, captain turns, picks, undo, reset and reload; zero API/config requests and real sign-in session unchanged.');
} finally {for(const page of tabs){await page.send('Page.close');page.socket.close();}}
