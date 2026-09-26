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
  for(let i=1;i<=6;i++)await api('/signups',{player:'Draft '+i,discord:'draft.'+i,consent:true});
  const initial=await api('/draft'),target=initial.players[5];
  const roster=await tab('roster.html'),draft=await tab('draft.html');
  await login(draft,'reviewer');
  await roster.until(`document.querySelector('#login-form')`);
  await roster.run(`document.querySelector('#reviewer-id').value='organiser';document.querySelector('#reviewer-code').value=${JSON.stringify(codes.reviewer)};document.querySelector('#login-form button').click()`);
  await roster.until(`document.querySelectorAll('.roster-entry').length===6`);
  assert.equal(await roster.run(`document.querySelectorAll('[name=includeInDraft]:checked').length`),6);
  const setIncluded=async value=>{
    await roster.run(`{const form=document.querySelector('#player-${target.id}').closest('form');const include=form.querySelector('[name=includeInDraft]');include.checked=${value};include.dispatchEvent(new Event('input',{bubbles:true}));form.querySelector('[name=paidEntryFee]').checked=true;form.querySelector('button').click()}`);
    await roster.until(`document.querySelector('#player-${target.id}').closest('form').querySelector('button').disabled===false && document.querySelector('#roster-count').textContent.includes('${value?'6 included in draft':'5 included in draft'}')`);
  };
  await setIncluded(false);
  await draft.until(`document.querySelectorAll('.player-card').length===5`);
  assert.equal(await draft.run(`Boolean(document.querySelector('#vampire-captain option[value="${target.id}"]'))`),false);
  assert.equal(await roster.run(`document.querySelector('#player-${target.id}').closest('article').textContent.includes('Excluded from draft')`),true);
  await setIncluded(true);
  await draft.until(`document.querySelectorAll('.player-card').length===6`);
  await setIncluded(false);
  await draft.until(`document.querySelectorAll('.player-card').length===5`);
  await draft.run(`document.querySelector('#vampire-captain').value=${JSON.stringify(initial.players[0].id)};document.querySelector('#werewolf-captain').value=${JSON.stringify(initial.players[1].id)};document.querySelector('#setup-form').requestSubmit(document.querySelector('#start-draft'))`);
  assert.equal(await draft.run(`document.querySelector('#confirm-copy').textContent.includes('5 included players')`),true);
  await draft.run(`document.querySelector('#confirm-action').click()`);
  await draft.until(`document.querySelectorAll('.player-card').length===3`);
  assert.equal(await draft.run(`document.querySelector('#vampire-count').textContent`),'1 / 3 players');
  assert.equal(await draft.run(`document.querySelector('#werewolf-count').textContent`),'1 / 2 players');
  await roster.until(`document.querySelector('#player-${target.id}').closest('form').querySelector('[name=includeInDraft]').disabled`);
  for(let i=0;i<3;i++) {
    await draft.run(`document.querySelector('.player-card button').click();document.querySelector('#confirm-action').click()`);
    await draft.until(`document.querySelector('#pick-history').children.length===${i+1}`);
  }
  assert.equal(await draft.run(`document.querySelector('#turn-title').textContent`),'The teams are chosen');
  const record=(await api('/signups')).signups.find(p=>p.id===target.id);
  assert.equal(record.include_in_draft,0);assert.equal(record.paid_entry_fee,1);assert.equal(record.team_id,'');
  await roster.run(`document.querySelector('#refresh').click()`);
  await roster.until(`document.querySelector('#roster-count').textContent.includes('3 Team Vampire')`);
  assert.equal(await roster.run(`document.querySelector('#player-${target.id}').closest('form').querySelector('[name=includeInDraft]').disabled`),true);
  const csv=await roster.run(`(async()=>{const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;let captured;URL.createObjectURL=blob=>{captured=blob.text();return originalURL(blob)};HTMLAnchorElement.prototype.click=function(){if(!this.download)originalClick.call(this)};try{document.querySelector('#export').click();return await captured}finally{URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick}})()`);
  assert.match(csv, /"Include in draft"/);assert.ok(csv.split('\r\n').some(line=>line.includes('Draft 6')&&line.endsWith('"No"')));
  await roster.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await roster.run('document.documentElement.scrollWidth<=innerWidth'),true);
  for(const page of tabs)assert.deepEqual(page.errors,[]);
  console.log('PASS: include/exclude/re-include in browser, captain options, 3:2 capacities, completed draft lock, payment preservation and CSV export.');
} finally {for(const page of tabs){await page.send('Page.close');page.socket.close();}}
