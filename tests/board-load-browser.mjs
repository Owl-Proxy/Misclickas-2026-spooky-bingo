// Run with a headless Chrome debugging endpoint on port 9333. Never contacts the live Worker.
// Wiki images are downloaded once into ignored test-results, then served locally to every browser.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDevServer } from '../scripts/dev-server.mjs';
import { fixture, env } from './helpers.mjs';

const root = 'http://localhost:4175';
const cacheDir = 'test-results/board-load-images';
await mkdir(cacheDir, { recursive: true });
const originals = [...new Set([...env.BOARD_SVG.matchAll(/href="(https?:[^"]+)"/g)].map(m => m[1]))];
const images = new Map();
let nextImage = 0, downloaded = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (nextImage < originals.length) {
    const index = nextImage++, url = originals[index];
    const key = createHash('sha256').update(url).digest('hex');
    let bytes;
    try { bytes = await readFile(`${cacheDir}/${key}`); }
    catch {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, `Wiki asset: ${url}`);
      assert.match(response.headers.get('content-type'), /^image\//, url);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(`${cacheDir}/${key}`, bytes); downloaded++;
    }
    images.set(`/test-images/${index}`, { bytes, type: url.includes('.webp') ? 'image/webp' : url.includes('.gif') ? 'image/gif' : 'image/png' });
  }
}));
console.log(`Prepared ${images.size} Wiki images (${downloaded} downloaded; remaining images embedded in SVG).`);
const svg = env.BOARD_SVG.replace(/href="(https?:[^"]+)"/g, (_, url) => `href="${root}/api/test-images/${originals.indexOf(url)}"`);
const { app, store } = fixture();
store.teams.set('vampire', { version: 1, teamId: 'vampire', submissions: [{
  id: 'local-load-fixture', teamId: 'vampire', tileId: 'the-blood-theatre', choiceId: 'scythe-of-vitur',
  quantity: 1, status: 'approved', player: 'Local Test', createdAt: '2026-10-02T12:00:00Z', revision: 1
}] });
const snapshot = JSON.stringify([...store.teams]);
let boardPublic = true;
let requestCounts = {}, apiErrors = [], writes = 0;
const server = createDevServer(async request => {
  const path = new URL(request.url).pathname;
  requestCounts[path] = (requestCounts[path] || 0) + 1;
  if (request.method !== 'GET') { writes++; return new Response('Read-only load test', {status:405}); }
  if (images.has(path)) {
    const image = images.get(path);
    return new Response(image.bytes, {headers:{'Content-Type':image.type,'Cache-Control':'no-store'}});
  }
  const response = await app.fetch(request, {...env, BOARD_PUBLIC:String(boardPublic), BOARD_SVG:svg, ALLOWED_ORIGINS:root});
  if (!response.ok) apiErrors.push({path,status:response.status});
  return response;
});
await new Promise(resolve => server.listen(4175, '127.0.0.1', resolve));
let socket;
try {
  const version = await (await fetch('http://127.0.0.1:9333/json/version')).json();
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
  let nextCommand=0;
  const pending=new Map(), sessions=new Map();
  socket.onmessage=event => {
    const message=JSON.parse(event.data);
    if (message.id) {
      const callback=pending.get(message.id); if (!callback) return;
      pending.delete(message.id); clearTimeout(callback.timer);
      message.error ? callback.reject(Error(JSON.stringify(message.error))) : callback.resolve(message.result);
    }
    const page=sessions.get(message.sessionId); if (!page) return;
    if (message.method==='Runtime.exceptionThrown') page.errors.push(message.params.exceptionDetails.text);
    if (message.method==='Network.loadingFailed') page.failures.push(message.params.errorText);
    if (message.method==='Network.responseReceived') {
      const r=message.params.response;
      if (r.status>=400 && !r.url.endsWith('/favicon.ico')) page.errors.push(`${r.status} ${r.url}`);
    }
  };
  function send(method,params={},sessionId) {
    return new Promise((resolve,reject) => {
      const id=++nextCommand;
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timed out: ${method}`));},90000);
      pending.set(id,{resolve,reject,timer}); socket.send(JSON.stringify({id,method,params,sessionId}));
    });
  }
  async function evaluate(page,expression) {
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},page.sessionId);
    if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async function waitFor(page,expression) {
    const deadline=Date.now()+90000;
    while(Date.now()<deadline) {
      const value=await evaluate(page,expression); if(value) return value;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw Error(`Page ${page.index}: timed out waiting for ${expression}`);
  }
  const scenarios=[];
  // Each page has a separate empty browser context; browser caching is disabled.
  for (const scenario of [{count:1,public:true},{count:30,public:true},{count:40,public:true},{count:40,public:false}]) {
    boardPublic=scenario.public; requestCounts={}; apiErrors=[];
    const pages=[];
    console.log(`Starting ${scenario.count} cold browser sessions, board ${boardPublic?'revealed':'locked'}.`);
    try {
      // Prepare idle tabs before releasing all navigations together.
      for(let index=0;index<scenario.count;index++) {
        const {browserContextId}=await send('Target.createBrowserContext');
        const page={index,browserContextId,errors:[],failures:[]}; pages.push(page);
        const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
        const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
        Object.assign(page,{targetId,sessionId}); sessions.set(sessionId,page);
        for(const method of ['Runtime.enable','Page.enable','Network.enable']) await send(method,{},sessionId);
        await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);
        await send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
      }
      const started=Date.now();
      const results=await Promise.allSettled(pages.map(async page=>{
        const team=page.index%2?'werewolf':'vampire';
        await send('Page.navigate',{url:`${root}/?team=${team}`},page.sessionId);
        if (!scenario.public) {
          await waitFor(page,`document.querySelector('#gate-form')?.hidden === false`);
          assert.equal(await evaluate(page,`document.querySelector('#board-app').hidden && !document.querySelector('#board').getAttribute('data')`),true);
        } else {
          await waitFor(page,`!document.querySelector('#board-app')?.hidden && document.querySelector('#board')?.contentDocument?.readyState === 'complete' && document.querySelector('#board').contentDocument.querySelectorAll('g.tile[role=button]').length === 54 && document.querySelector('#score').textContent.includes('${team==='vampire'?1:0} / 52')`);
          // Exercise the rendered SVG, not just a successful HTTP response.
          await evaluate(page,`[...document.querySelector('#board').contentDocument.querySelectorAll('g.tile')].find(g=>g.querySelector('title').textContent.startsWith('The Hungry Chest:')).dispatchEvent(new MouseEvent('click'))`);
          assert.equal(await evaluate(page,`document.querySelector('#tile-dialog').open && document.querySelector('#requirements').textContent.includes('5 × Mimic completions')`),true);
          await evaluate(page,`document.querySelector('#tile-dialog').close()`);
        }
        return Date.now()-started;
      }));
      const failures=results.flatMap((r,i)=>r.status==='rejected'?[{page:i,error:String(r.reason)}]:[]);
      const times=results.filter(r=>r.status==='fulfilled').map(r=>r.value).sort((a,b)=>a-b);
      const row={...scenario,passed:times.length,failures,medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1),apiErrors,
        browserErrors:pages.flatMap(p=>p.errors.map(error=>({page:p.index,error}))),networkFailures:pages.flatMap(p=>p.failures.map(error=>({page:p.index,error}))),
        requests:Object.fromEntries(Object.entries(requestCounts).filter(([path])=>!path.startsWith('/test-images/'))),
        imageRequests:Object.entries(requestCounts).filter(([path])=>path.startsWith('/test-images/')).reduce((sum,[,count])=>sum+count,0)};
      scenarios.push(row); console.log(JSON.stringify(row));
      if(scenario.public && !failures.length) {
        const screenshot=await send('Page.captureScreenshot',{format:'png'},pages[0].sessionId);
        await writeFile(`test-results/board-load-${scenario.count}.png`,Buffer.from(screenshot.data,'base64'));
      }
      if(!scenario.public) {
        assert.equal(requestCounts['/config']||0,0); assert.equal(requestCounts['/board.svg']||0,0);
      }
    } finally {
      for(const page of pages) {
        await send('Target.disposeBrowserContext',{browserContextId:page.browserContextId});
        sessions.delete(page.sessionId);
      }
    }
  }
  const report={date:new Date().toISOString(),browser:version.Browser,externalImageUrls:originals.length,downloaded,svgBytes:Buffer.byteLength(env.BOARD_SVG),
    assumptions:'One local Chrome process, isolated empty browser contexts, cache disabled, real site and Worker routes, in-memory storage, real Wiki images mirrored locally, revealed board and locked visitor scenarios. Not production Cloudflare/GitHub capacity or independent physical devices.',scenarios,writes};
  await writeFile('test-results/board-browser-load.json',JSON.stringify(report,null,2));
  assert.equal(writes,0); assert.equal(JSON.stringify([...store.teams]),snapshot); assert.equal(store.images.size,0);
  for(const row of scenarios) {
    assert.equal(row.passed,row.count); assert.deepEqual(row.apiErrors,[]); assert.deepEqual(row.browserErrors,[]); assert.deepEqual(row.networkFailures,[]);
  }
  console.log('PASS: cold browser loads, SVG rendering, team progress, tile interaction, and unrevealed gate. No submissions written.');
} finally {
  socket?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
