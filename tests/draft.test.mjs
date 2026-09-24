import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../worker/index.mjs';
import {env,codes} from './helpers.mjs';
import {signupDatabase} from './signup-db.mjs';
import {nextDraftTeam} from '../worker/draft.mjs';

async function fixture(t,count=8) {
  const db=signupDatabase(); t.after(()=>db.close());
  const settings={...env,BOARD_PUBLIC:'false',SIGNUPS_DB:db};
  const app=createApp(()=>{throw Error('Draft must not use GitHub');});
  const request=async(path,body,role='reviewer',extraHeaders={})=>{
    const headers=role==='reviewer'?{Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser'}:
      role?{Authorization:`Bearer ${codes[role]}`,'X-Draft-Team':role}:{};
    const response=await app.fetch(new Request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...headers,...extraHeaders,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)}),settings);
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  for(let i=0;i<count;i++) await request('/signups',{player:`Player ${i}`,discord:`discord.${i}`,consent:true,website:''},null);
  const read=async()=>(await request('/draft')).body;
  const start=async(mode='snake',firstTeam='vampire')=>{
    const view=await read();return request('/draft/start',{revision:view.state.revision,mode,firstTeam,vampireCaptainId:view.players[0].id,werewolfCaptainId:view.players[1].id});
  };
  const pick=async(role,signupId,revision)=>request('/draft/pick',{signupId,revision},role);
  return {db,request,read,start,pick};
}
test('draft is private, uses existing team codes, and does not grant roster or reviewer powers',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/draft',undefined,null)).status,401);
  for(const team of ['vampire','werewolf']) {
    assert.equal((await f.request('/draft/auth',{role:'captain',id:team},team)).status,200);
    const read=await f.request('/draft',undefined,team);
    assert.equal(read.status,200);assert.equal(read.headers.get('Cache-Control'),'no-store');
    assert.equal(read.body.players[0].paid_entry_fee,undefined);assert.equal(read.body.players[0].role_assigned,undefined);
    assert.equal((await f.request('/signups',undefined,team)).status,401);
    assert.equal((await f.request('/draft/start',{revision:0},team)).status,403);
    assert.equal((await f.request('/config',undefined,team)).status,401);
  }
  assert.equal((await f.request('/draft',undefined,'vampire',{'X-Draft-Team':'werewolf'})).status,401);
  assert.equal((await f.request('/draft',undefined,'reviewer',{Origin:'https://evil.test'})).status,403);
  const options=await createApp().fetch(new Request('http://localhost/draft',{method:'OPTIONS',headers:{Origin:'http://localhost:4173'}}),env);
  assert.match(options.headers.get('Access-Control-Allow-Headers'),/X-Draft-Team/);
});
test('snake draft commits picks and roster assignments together, balances teams, and preserves payment',async t=>{
  const f=await fixture(t,8);let view=await f.read();
  await f.request('/signups/'+view.players[2].id,{teamId:'',roleAssigned:false,paidEntryFee:true,revision:0});
  assert.equal((await f.start()).status,200);
  const sequence=[];
  for(let i=0;i<6;i++) {
    view=await f.read();const player=view.players.find(p=>p.in_pool&&!p.team_id);sequence.push(view.nextTeam);
    assert.equal((await f.pick(view.nextTeam,player.id,view.state.revision)).status,200);
    const roster=(await f.request('/signups')).body.signups;
    const entry=roster.find(p=>p.id===player.id);assert.equal(entry.team_id,view.nextTeam);assert.equal(entry.role_assigned,0);
    if(i===0)assert.equal(entry.paid_entry_fee,1);
  }
  assert.deepEqual(sequence,['vampire','werewolf','werewolf','vampire','vampire','werewolf']);
  view=await f.read();assert.equal(view.state.status,'complete');assert.equal(view.nextTeam,null);
  for(const team of ['vampire','werewolf'])assert.equal(view.players.filter(p=>p.team_id===team).length,4);
  assert.equal(view.picks.length,6);
  assert.equal((await f.db.prepare('SELECT * FROM draft_audit').all()).results.length,7);
});
test('alternating draft handles first-pick choice and an odd player count',async t=>{
  const f=await fixture(t,7);assert.equal((await f.start('alternating','werewolf')).status,200);
  const sequence=[];
  for(let i=0;i<5;i++){const v=await f.read();sequence.push(v.nextTeam);assert.equal((await f.pick(v.nextTeam,v.players.find(p=>!p.team_id).id,v.state.revision)).status,200);}
  assert.deepEqual(sequence,['werewolf','vampire','werewolf','vampire','werewolf']);
  const v=await f.read();assert.equal(v.players.filter(p=>p.team_id==='werewolf').length,4);
});
test('out-of-turn, duplicate and concurrent picks cannot consume extra turns',async t=>{
  const f=await fixture(t);await f.start();const v=await f.read(),available=v.players.filter(p=>!p.team_id);
  assert.equal((await f.pick('werewolf',available[0].id,v.state.revision)).status,403);
  const outcomes=await Promise.all([f.pick('vampire',available[0].id,v.state.revision),f.pick('vampire',available[1].id,v.state.revision)]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const after=await f.read();assert.equal(after.picks.length,1);assert.equal(after.players.filter(p=>p.team_id).length,3);
  assert.equal((await f.pick('vampire',available[0].id,v.state.revision)).status,409);
  const picked=after.picks[0];assert.equal((await f.pick('werewolf',picked.signup_id,after.state.revision)).status,409);
});
test('pause, undo, and resume restore the turn and roster without erasing entry fees',async t=>{
  const f=await fixture(t);await f.start();let v=await f.read();const player=v.players.find(p=>!p.team_id);
  await f.pick('vampire',player.id,v.state.revision);v=await f.read();
  const entry=v.players.find(p=>p.id===player.id);
  assert.equal((await f.request('/signups/'+entry.id,{teamId:'vampire',roleAssigned:true,paidEntryFee:true,revision:entry.revision})).status,200);
  assert.equal((await f.request('/draft/pause',{revision:v.state.revision},'vampire')).status,403);
  assert.equal((await f.request('/draft/pause',{revision:v.state.revision})).status,200);v=await f.read();
  assert.equal((await f.pick('werewolf',v.players.find(p=>!p.team_id).id,v.state.revision)).status,409);
  assert.equal((await f.request('/draft/undo',{revision:v.state.revision})).status,200);v=await f.read();
  assert.equal(v.state.status,'paused');assert.equal(v.nextTeam,'vampire');assert.equal(v.picks.length,0);
  const restored=v.players.find(p=>p.id===player.id);assert.equal(restored.team_id,'');assert.equal(restored.role_assigned,0);assert.equal(restored.paid_entry_fee,1);
  assert.equal((await f.request('/draft/resume',{revision:v.state.revision})).status,200);
});
test('roster team edits are blocked during drafts, late signups stay outside the original pool',async t=>{
  const f=await fixture(t);await f.start();const v=await f.read(),player=v.players.find(p=>!p.team_id);
  assert.equal((await f.request('/signups/'+player.id,{teamId:'werewolf',roleAssigned:false,revision:player.revision})).status,409);
  await f.request('/signups',{player:'Late player',discord:'late',consent:true,website:''},null);
  const after=await f.read(),late=after.players.find(p=>p.player==='Late player');assert.equal(late.in_pool,0);
  assert.equal((await f.pick('vampire',late.id,after.state.revision)).status,409);
});
test('start keeps existing assignments, excludes captains from picks, and skips full teams',async t=>{
  const f=await fixture(t,6);const v=await f.read();
  for(const p of v.players.slice(2,4))await f.request('/signups/'+p.id,{teamId:'vampire',roleAssigned:true,revision:0});
  assert.equal((await f.start()).status,200);const after=await f.read();assert.equal(after.nextTeam,'werewolf');
  assert.equal((await f.pick('werewolf',after.state.vampireCaptainId,after.state.revision)).status,409);
  assert.equal(after.players.find(p=>p.id===v.players[2].id).role_assigned,1);
  assert.equal(nextDraftTeam({first_team:'vampire',mode:'snake',pick_count:0},[]),null);
});
test('D1 batch failure rolls back both state and assignments',async t=>{
  const f=await fixture(t);await f.start();const before=await f.read();
  const rawBatch=f.db.batch;let failOnce=true;
  f.db.batch=async statements=>{
    if(failOnce&&statements.length>3){failOnce=false;return rawBatch([...statements,f.db.prepare("INSERT INTO draft_state (id) VALUES (1)")]);}
    return rawBatch(statements);
  };
  assert.equal((await f.pick('vampire',before.players.find(p=>!p.team_id).id,before.state.revision)).status,502);
  const after=await f.read();assert.deepEqual(after,before);
});
