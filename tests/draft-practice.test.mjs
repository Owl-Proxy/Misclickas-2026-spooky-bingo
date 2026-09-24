import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeDraft} from '../web/draft-practice.mjs';
import {nextDraftTeam} from '../worker/draft.mjs';

const organiser={role:'reviewer',id:'practice'};
test('practice follows live pick order, enforces captain turns, and completes both draft modes',()=>{
  for(const mode of ['snake','alternating'])for(const firstTeam of ['vampire','werewolf']) {
    const request=createPracticeDraft();
    const view=()=>request('/draft');
    const write=(path,body={},account=organiser)=>request(path,{revision:view().state.revision,...body},account);
    assert.equal(view().players.length,36);
    write('/draft/start',{mode,firstTeam,vampireCaptainId:'practice-1',werewolfCaptainId:'practice-2'});
    while(view().state.status==='active') {
      const snapshot=view(),{state,players}=snapshot;
      const team=nextDraftTeam({mode,first_team:firstTeam,pick_count:state.pickCount},players);
      assert.equal(snapshot.nextTeam,team);
      const signupId=players.find(p=>!p.team_id).id;
      assert.throws(()=>write('/draft/pick',{signupId},{role:'captain',id:team==='vampire'?'werewolf':'vampire'}),/other captain/);
      write('/draft/pick',{signupId},{role:'captain',id:team});
    }
    assert.equal(view().picks.length,34);
    assert.equal(view().players.filter(p=>p.team_id==='vampire').length,18);
    write('/draft/undo');assert.equal(view().state.status,'paused');assert.equal(view().picks.length,33);
    write('/draft/resume');assert.equal(view().state.status,'active');
    const independent=createPracticeDraft();assert.equal(independent('/draft').state.status,'waiting');
    assert.equal(independent('/draft').picks.length,0);
  }
});

test('practice rejects invalid changes without consuming turns and returns isolated snapshots',()=>{
  const request=createPracticeDraft();
  const start={revision:0,mode:'snake',firstTeam:'vampire',vampireCaptainId:'practice-1',werewolfCaptainId:'practice-1'};
  assert.throws(()=>request('/draft/start',start,organiser),/different/);
  assert.equal(request('/draft').state.revision,0);
  start.werewolfCaptainId='practice-2';request('/draft/start',start,organiser);
  assert.throws(()=>request('/draft/pick',{revision:0,signupId:'practice-3'},organiser),/changed/);
  assert.throws(()=>request('/draft/pause',{revision:1},{role:'captain',id:'vampire'}),/organiser/);
  request('/draft/pause',{revision:1},organiser);
  assert.throws(()=>request('/draft/pick',{revision:2,signupId:'practice-3'},organiser),/not accepting/);
  const snapshot=request('/draft');snapshot.players[2].team_id='vampire';
  assert.equal(request('/draft').players[2].team_id,'');
});
