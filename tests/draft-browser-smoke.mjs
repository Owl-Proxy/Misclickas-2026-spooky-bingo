// Run a fresh tests/preview-server.mjs and headless Chrome on port 9333. Local data only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {codes} from './helpers.mjs';
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
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:4173/'+path});
  return result;
}
async function login(page,role) {
  await page.until(`typeof document.querySelector('#draft-login')?.onsubmit === 'function'`);
  await page.run(`document.querySelector('#login-role').value=${JSON.stringify(role)};document.querySelector('#login-role').dispatchEvent(new Event('change'));document.querySelector('#reviewer-id').value='organiser';document.querySelector('#access-code').value=${JSON.stringify(codes[role])};document.querySelector('#draft-login').requestSubmit(document.querySelector('#draft-login button'));`);
  await page.until(`document.querySelector('#draft-room').hidden===false`);
}
const snapshot=async()=>{
  const r=await fetch('http://localhost:4173/api/draft',{headers:{Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser'}});assert.equal(r.status,200);return r.json();
};
async function screenshot(page,name){await writeFile('test-results/'+name+'.png',Buffer.from((await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
try {
  for(let i=0;i<36;i++) {
    const r=await fetch('http://localhost:4173/api/signups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({player:'Spooky '+String(i).padStart(2,'0'),discord:i===5?'<img src=x onerror=alert(1)>':`spooky.${i}`,consent:true,website:''})});assert.equal(r.status,202);
  }
  const organiser=await tab('draft.html'),vampire=await tab('draft.html'),wolf=await tab('draft.html'),roster=await tab('roster.html');
  assert.equal(await organiser.run(`document.querySelector('#draft-room').hidden`),true);
  await login(organiser,'reviewer');await login(vampire,'vampire');await login(wolf,'werewolf');
  await roster.until(`document.querySelector('#login-form')`);
  await roster.run(`document.querySelector('#reviewer-id').value='organiser';document.querySelector('#reviewer-code').value=${JSON.stringify(codes.reviewer)};document.querySelector('#login-form').requestSubmit(document.querySelector('#login-form button'));`);
  await roster.until(`document.querySelectorAll('.roster-entry').length===36`);
  assert.equal(await vampire.run(`document.querySelector('#draft-setup').hidden`),true);
  const initial=await snapshot();
  await organiser.run(`document.querySelector('#vampire-captain').value=${JSON.stringify(initial.players[0].id)};document.querySelector('#werewolf-captain').value=${JSON.stringify(initial.players[1].id)};document.querySelector('#setup-form').requestSubmit(document.querySelector('#start-draft'));`);
  assert.equal(await organiser.run(`document.querySelector('#confirm-dialog').open`),true,await organiser.run(`JSON.stringify({valid:document.querySelector('#setup-form').checkValidity(),values:[...document.querySelectorAll('#setup-form select')].map(s=>[s.id,s.value]),disabled:document.querySelector('#start-draft').disabled})`));
  await organiser.run(`document.querySelector('#confirm-action').click()`);
  await organiser.until(`document.querySelector('#turn-title').textContent.includes('Team Vampire is choosing')`);
  await vampire.until(`document.querySelector('#turn-title').textContent.includes('Team Vampire is choosing') && !document.querySelector('.player-card button').disabled`);
  await wolf.until(`document.querySelector('#turn-title').textContent.includes('Team Vampire is choosing')`);
  assert.equal(await wolf.run(`document.querySelector('.player-card button').disabled`),true);
  assert.equal(await vampire.run(`document.querySelector('#player-pool img')`),null);
  const pickId=initial.players[2].id;
  await vampire.run(`document.querySelector('[data-player-id="${pickId}"] button').click();document.querySelector('#confirm-action').click();`);
  await wolf.until(`document.querySelector('#latest-pick').textContent.includes('Spooky 02') && !document.querySelector('.player-card button').disabled`);
  await roster.until(`document.querySelector('#team-${pickId}').value==='vampire' && document.querySelector('#team-${pickId}').disabled`);
  assert.equal(await wolf.run(`Boolean(document.querySelector('[data-player-id="${pickId}"]'))`),false);
  // Snake draft gives Werewolf picks 2 and 3, but cancellation must not consume a turn.
  const secondId=initial.players[3].id;
  await wolf.run(`document.querySelector('[data-player-id="${secondId}"] button').click();document.querySelector('#confirm-action').click();`);
  await wolf.until(`document.querySelector('#pick-number').textContent.includes('Pick 3')`);
  const thirdId=initial.players[4].id;
  await wolf.run(`document.querySelector('[data-player-id="${thirdId}"] button').click()`);
  await wolf.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wolf.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wolf.until(`!document.querySelector('#confirm-dialog').open`);
  assert.equal((await snapshot()).picks.length,2);
  await organiser.until(`document.querySelector('#pick-number').textContent.includes('Pick 3')`);
  await screenshot(organiser,'draft-desktop');
  await wolf.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await wolf.run(`document.documentElement.scrollWidth <= innerWidth`),true);
  await screenshot(wolf,'draft-mobile');
  // Undo propagates to every view, resets assignment, and pauses for the organiser.
  await organiser.run(`document.querySelector('#undo-pick').click();document.querySelector('#confirm-action').click()`);
  await wolf.until(`document.querySelector('#turn-title').textContent.includes('paused')`);
  await roster.until(`document.querySelector('#team-${secondId}').value===''`);
  assert.equal((await snapshot()).picks.length,1);
  await organiser.run(`document.querySelector('#pause-draft').click()`);
  await wolf.until(`!document.querySelector('.player-card button').disabled`);
  await wolf.send('Page.reload',{ignoreCache:true});
  await wolf.until(`document.querySelector('#draft-room').hidden===false`);
  // Incomplete roster edits are retained during the next automatic refresh.
  await roster.run(`window.editNode=document.querySelector('.roster-entry input[name=paidEntryFee]');window.editNode.checked=true;window.editNode.dispatchEvent(new Event('input',{bubbles:true}));`);
  await new Promise(resolve=>setTimeout(resolve,10500));
  assert.equal(await roster.run(`window.editNode.isConnected && window.editNode.checked`),true);
  await wolf.run(`document.querySelector('#signout').click()`);
  assert.equal(await wolf.run(`document.querySelector('#draft-room').hidden && document.querySelector('#player-pool').children.length===0 && sessionStorage.getItem('bingo-draft')===null`),true);
  for(const page of tabs) assert.deepEqual(page.errors,[]);
  console.log('PASS: 36-player draft across organiser, both captains and roster; live picks, snake order, cancellation, undo, reload, mobile layout, and preserved roster edits.');
} finally {for(const page of tabs){await page.send('Page.close');page.socket.close();}}
