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

try {
  const page=await tab('draft.html');
  await login(page,'reviewer');
  await page.run(`document.querySelector('#signout').click()`);
  console.log('After organiser sign-out:',await page.run(`JSON.stringify({role:document.querySelector('#login-role').value,reviewerHidden:document.querySelector('#reviewer-field').hidden,reviewerRequired:document.querySelector('#reviewer-id').required})`));
  await page.run(`document.querySelector('#access-code').value=${JSON.stringify(codes.vampire)};document.querySelector('#draft-login button').click()`);
  await page.until(`document.querySelector('#draft-room').hidden===false`);
  assert.equal(await page.run(`document.querySelector('#turn-title').textContent`),'Awaiting the first pick');
  assert.equal(await page.run(`document.querySelector('#identity').textContent.includes('Vampire')`),true);
  await page.run(`document.querySelector('#signout').click();document.querySelector('#access-code').value='incorrect-local-test-code';document.querySelector('#draft-login button').click()`);
  await page.until(`document.querySelector('#draft-message').textContent.includes('not valid')`);
  assert.equal(await page.run(`document.querySelector('#login-panel').hidden`),false);
  assert.equal(await page.run(`document.querySelector('#draft-login button').disabled`),false);
  assert.equal(await page.run(`sessionStorage.getItem('bingo-draft')`),null);
  for(const page of tabs)assert.deepEqual(page.errors,[]);
  console.log('PASS: organiser sign-out to captain sign-in before draft start, plus visible invalid-code feedback.');
} finally {for(const page of tabs){await page.send('Page.close');page.socket.close();}}
