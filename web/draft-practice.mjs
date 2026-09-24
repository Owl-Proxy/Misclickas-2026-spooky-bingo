// An isolated, in-memory rehearsal. This module performs no network or storage writes.
export function createPracticeDraft() {
  const teams = [{id:'vampire',name:'Team Vampire'},{id:'werewolf',name:'Team Werewolf'}];
  const players = Array.from({length:36},(_,i)=>({id:`practice-${i+1}`,player:`Practice ${String(i+1).padStart(2,'0')}`,discord:`sample.player.${i+1}`,team_id:'',in_pool:0}));
  const state = {status:'waiting',mode:'snake',firstTeam:'vampire',pickCount:0,revision:0,vampireCaptainId:'',werewolfCaptainId:''};
  const picks = [];
  const fail = (status,message) => {throw Object.assign(Error(message),{status});};
  function nextTeam() {
    if(state.status==='waiting'||!players.some(p=>!p.team_id))return null;
    const second=state.firstTeam==='vampire'?'werewolf':'vampire';
    const turn=state.mode==='snake'?Math.floor((state.pickCount+1)/2)%2:state.pickCount%2;
    const preferred=turn?second:state.firstTeam;
    const capacity=preferred===state.firstTeam?Math.ceil(players.length/2):Math.floor(players.length/2);
    return players.filter(p=>p.team_id===preferred).length<capacity?preferred:preferred===second?state.firstTeam:second;
  }
  return function request(path,body,account) {
    if(path==='/draft'&&body===undefined)return structuredClone({state,players,picks,teams,nextTeam:nextTeam()});
    if(path!=='/draft/pick'&&account.role!=='reviewer')fail(403,'Only an organiser can manage the draft.');
    if(body?.revision!==state.revision)fail(409,'The practice draft changed. Refresh before trying again.');
    if(path==='/draft/start') {
      if(state.status!=='waiting')fail(409,'This practice draft has already started.');
      const vampire=players.find(p=>p.id===body.vampireCaptainId),werewolf=players.find(p=>p.id===body.werewolfCaptainId);
      if(!vampire||!werewolf||vampire===werewolf)fail(400,'Choose two different signed-up captains.');
      if(!['snake','alternating'].includes(body.mode)||!teams.some(t=>t.id===body.firstTeam))fail(400,'Choose a draft order and first team.');
      Object.assign(state,{status:'active',mode:body.mode,firstTeam:body.firstTeam,vampireCaptainId:vampire.id,werewolfCaptainId:werewolf.id});
      players.forEach(p=>p.in_pool=1);vampire.team_id='vampire';werewolf.team_id='werewolf';
    } else if(path==='/draft/pick') {
      if(state.status!=='active')fail(409,'The draft is not accepting picks right now.');
      const team=nextTeam();
      if(account.role==='captain'&&account.id!==team)fail(403,'It is the other captain’s turn.');
      const player=players.find(p=>p.id===body.signupId&&!p.team_id);
      if(!player)fail(409,'This player is not available to draft.');
      player.team_id=team;state.pickCount++;
      picks.push({number:state.pickCount,signup_id:player.id,team_id:team});
      if(!players.some(p=>!p.team_id))state.status='complete';
    } else if(path==='/draft/undo') {
      if(!picks.length)fail(409,'There are no practice picks to undo.');
      const last=picks.pop();players.find(p=>p.id===last.signup_id).team_id='';state.pickCount--;state.status='paused';
    } else if(path==='/draft/pause'||path==='/draft/resume') {
      const pause=path==='/draft/pause';
      if(state.status!==(pause?'active':'paused'))fail(409,'The draft status changed.');
      state.status=pause?'paused':'active';
    } else fail(404,'Unknown practice action.');
    state.revision++;
    return {revision:state.revision};
  };
}
