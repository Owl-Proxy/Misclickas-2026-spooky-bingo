import test from 'node:test';
import assert from 'node:assert/strict';
import { WiseOldMan, competitionView } from '../worker/wise-old-man.mjs';
import { createApp } from '../worker/index.mjs';
import { env, codes, MemoryStore } from './helpers.mjs';
const time = Date.parse('2026-10-10T12:00:00Z');
const team = { id: 'vampire', name: 'Team Vampire' };
export function sampleCompetition() {
  return { id: 156506, title: 'Test competition', type: 'team', startsAt: '2026-10-01T16:00:00Z', endsAt: '2026-11-01T03:59:00Z',
    participations: [
      { playerId: 1, teamName: 'Team Vampire', player: { username: 'vampire one', displayName: 'Vampire One', updatedAt: '2026-10-10T11:00:00Z' },
        deltas: [{ metric: 'barrows_chests', values: { start: 100, end: 125, gained: 25 } }, { metric: 'mimic', values: { start: 5, end: 7, gained: 2 } }] },
      { playerId: 2, teamName: 'Team Werewolf', player: { username: 'wolf one', updatedAt: '2026-10-10T11:00:00Z' },
        deltas: [{ metric: 'barrows_chests', values: { start: 1, end: 999, gained: 998 } }] }
    ] };
}
const view = (data, tile = 'the-crypt-keeper', now = time) => competitionView(data,156506,team,tile,new Date(time).toISOString(),now);

test('Bone Collector shows only Prayer XP, without interpreting XP as bone offerings', async () => {
  const data = sampleCompetition();
  data.participations[0].deltas.push({metric:'prayer',values:{start:100000,end:125200,gained:25200}});
  data.participations[0].deltas.push({metric:'total',values:{start:0,end:999999,gained:999999}});
  data.participations[1].deltas.push({metric:'prayer',values:{start:0,end:500000,gained:500000}});
  const result = view(data,'bone-collector');
  assert.equal(result.total,25200); assert.equal(result.metric,'prayer');
  assert.equal(result.target,null); assert.equal(result.players.length,1);
  assert.match(result.note,/XP alone does not complete this tile/);
  assert.equal(view(data,'bone-collector',Date.parse('2026-09-20')).total,null);
  assert.equal(view(sampleCompetition(),'bone-collector').total,null);
  const store = new MemoryStore();
  const app = createApp(()=>store,{}, {now:()=>time,fetch:async()=>Response.json(data)});
  const path = 'https://local.test/integrations/wise-old-man/vampire/bone-collector';
  assert.equal((await app.fetch(new Request(path,{headers:{Authorization:`Bearer ${codes.vampire}`}}),env)).status,401);
  const response = await app.fetch(new Request(path,{headers:{Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser'}}),env);
  assert.equal(response.status,200); assert.equal((await response.json()).total,25200);
  assert.equal(store.teams.size,0); assert.equal(store.images.size,0);
});

test('WOM uses the requested metric and team, never overall XP or the other team', () => {
  assert.equal(view(sampleCompetition()).total,25);
  assert.equal(view(sampleCompetition(),'the-hungry-chest').total,2);
  assert.equal(view(sampleCompetition(),'the-hungry-chest').target,5);
  assert.match(view(sampleCompetition(),'fists-of-fury').note,/without equipped weapons/);
  assert.equal(view(sampleCompetition()).players.length,1);
  assert.equal(view(sampleCompetition(),'the-crypt-keeper',Date.parse('2026-09-20')).total,null);
  assert.equal(view(sampleCompetition(),'the-crypt-keeper',Date.parse('2026-11-02')).phase,'ended');
});

test('WOM distinguishes zero from missing, unranked, inconsistent and empty-team data', () => {
  for (const values of [{start:-1,end:25,gained:25}, {start:1,end:25,gained:99}, {start:25,end:1,gained:-24}, {start:null,end:25,gained:25}]) {
    const data=sampleCompetition(); data.participations[0].deltas[0].values=values;
    assert.equal(view(data).total,null); assert.equal(view(data).missingPlayers,1);
  }
  const zero=sampleCompetition(); zero.participations[0].deltas[0].values={start:0,end:0,gained:0}; assert.equal(view(zero).total,0);
  const missing=sampleCompetition(); missing.participations[0].deltas=[]; assert.equal(view(missing).total,null);
  const empty=sampleCompetition(); empty.participations=[]; assert.equal(view(empty).total,null);
  const duplicate=sampleCompetition(); duplicate.participations.push(duplicate.participations[0]); assert.throws(()=>view(duplicate),/duplicated roster/);
  assert.throws(()=>view({...sampleCompetition(),id:999}),/unexpected competition/);
});

test('WOM coalesces concurrent checks, caches all metrics, and backs off after failures', async () => {
  let now=time, calls=0, fail=false;
  const tracker=new WiseOldMan({now:()=>now,fetch:async url=>{
    calls++; assert.match(url,/metrics=barrows_chests&metrics=mimic&metrics=prayer$/);
    return fail ? new Response('busy',{status:429,headers:{'Retry-After':'120'}}) : Response.json(sampleCompetition());
  }});
  await Promise.all(Array.from({length:20},()=>tracker.get(156506,team,'the-crypt-keeper')));
  await tracker.get(156506,team,'the-hungry-chest'); assert.equal(calls,1);
  await tracker.get(156506,team,'bone-collector'); assert.equal(calls,1);
  now+=60001; fail=true;
  await assert.rejects(tracker.get(156506,team,'the-crypt-keeper'),e=>e.retryAfter===120);
  await assert.rejects(tracker.get(156506,team,'the-crypt-keeper')); assert.equal(calls,2);
  now+=120001; fail=false; assert.equal((await tracker.get(156506,team,'the-crypt-keeper')).total,25); assert.equal(calls,3);
});

test('WOM endpoint is reviewer-only before and after reveal and never writes bingo progress', async () => {
  let calls=0; const store=new MemoryStore();
  const app=createApp(()=>store,{}, {now:()=>time,fetch:async()=>{calls++;return Response.json(sampleCompetition());}});
  const path='https://local.test/integrations/wise-old-man/vampire/the-crypt-keeper';
  const reviewer={Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser'};
  for(const boardPublic of ['false','true']) {
    for(const headers of [{},{Authorization:`Bearer ${codes.vampire}`}]) {
      assert.equal((await app.fetch(new Request(path,{headers}),{...env,BOARD_PUBLIC:boardPublic})).status,401);
    }
    const r=await app.fetch(new Request(path,{headers:reviewer}),{...env,BOARD_PUBLIC:boardPublic});
    assert.equal(r.status,200); assert.equal((await r.json()).total,25);
  }
  assert.equal(calls,1); assert.equal(store.teams.size,0); assert.equal(store.images.size,0);
  for(const suffix of ['vampire/the-blood-theatre','missing/the-crypt-keeper','vampire/the-crypt-keeper/extra']) {
    assert.equal((await app.fetch(new Request('https://local.test/integrations/wise-old-man/'+suffix,{headers:reviewer}),env)).status,404);
  }
});

test('WOM outage and malformed payload return retryable errors without reporting zero', async () => {
  for(const transport of [async()=>{throw Error('offline');},async()=>Response.json({})]) {
    const app=createApp(()=>new MemoryStore(),{},{fetch:transport,now:()=>time});
    const r=await app.fetch(new Request('https://local.test/integrations/wise-old-man/vampire/the-crypt-keeper',{
      headers:{Authorization:`Bearer ${codes.reviewer}`,'X-Reviewer-Id':'organiser'}
    }),env);
    assert.equal(r.status,503); assert.equal(r.headers.get('Retry-After'),'60'); assert.equal((await r.json()).total,undefined);
  }
});
