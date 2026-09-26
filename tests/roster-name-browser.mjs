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

const api=async(path,body)=>{
  const response=await fetch('http://localhost:4173/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,body&&path==='/signups'?202:200);return response.json();
};
try {
  for(let i=1;i<=4;i++)await api('/signups',{player:'Member '+i,discord:'member.'+i,consent:true});
  const original=await api('/draft');
  await api('/draft/start',{revision:0,mode:'snake',firstTeam:'vampire',vampireCaptainId:original.players[0].id,werewolfCaptainId:original.players[1].id});
  const target=original.players[2];
  await api('/draft/pick',{revision:1,signupId:target.id});
  await api('/signups/'+target.id,{revision:1,teamId:'vampire',roleAssigned:true,paidEntryFee:true});
  const before=await api('/draft');
  const roster=await tab('roster.html'),draft=await tab('draft.html');
  await login(draft,'reviewer');
  await roster.until(`document.querySelector('#login-form')`);
  await roster.run(`document.querySelector('#reviewer-id').value='organiser';document.querySelector('#reviewer-code').value=${JSON.stringify(codes.reviewer)};document.querySelector('#login-form button').click()`);
  await roster.until(`document.querySelectorAll('.roster-entry').length===4`);
  await roster.run(`window.editName=document.querySelector('#player-${target.id}');window.editName.value='Renamed-Owl';window.editName.dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.equal(await roster.run(`window.editName.checkValidity()`),true);
  assert.equal(await roster.run(`document.querySelector('#team-${target.id}').disabled`),true);
  // A pending correction must survive an automatic roster update interval.
  await new Promise(resolve=>setTimeout(resolve,10500));
  assert.equal(await roster.run(`window.editName.isConnected && window.editName.value==='Renamed-Owl'`),true);
  await roster.run(`window.editName.closest('form').querySelector('button').click()`);
  await roster.until(`document.querySelector('#roster-message').textContent.includes('Saved changes for Renamed-Owl')`);
  await draft.until(`document.querySelector('#vampire-roster').textContent.includes('Renamed-Owl') && document.querySelector('#pick-history').textContent.includes('Renamed-Owl')`);
  const after=await api('/draft'),updated=after.players.find(p=>p.id===target.id);
  assert.equal(updated.player,'Renamed-Owl');assert.equal(updated.team_id,'vampire');assert.equal(updated.paid_entry_fee,1);assert.equal(updated.role_assigned,1);
  assert.deepEqual(after.picks,before.picks);assert.deepEqual(after.state,before.state);
  await roster.run(`const input=document.querySelector('#player-${target.id}');input.value='Member 1';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').querySelector('button').click()`);
  await roster.until(`document.querySelector('#player-${target.id}').closest('form').querySelector('.message').textContent.includes('already registered')`);
  assert.equal((await api('/draft')).players.find(p=>p.id===target.id).player,'Renamed-Owl');
  await roster.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await roster.run('document.documentElement.scrollWidth<=innerWidth'),true);
  await writeFile('test-results/roster-name-mobile.png',Buffer.from((await roster.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  for(const page of tabs)assert.deepEqual(page.errors,[]);
  console.log('PASS: roster correction persists, keeps payment/role/team/pick, updates draft, survives polling, displays duplicate error and fits mobile.');
} finally {for(const page of tabs){await page.send('Page.close');page.socket.close();}}
