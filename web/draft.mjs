import {createPracticeDraft} from './draft-practice.mjs';
const practice=new URLSearchParams(location.search).get('practice')==='1';
let practiceRequest=practice?createPracticeDraft():null;
const $ = selector => document.querySelector(selector);
const el = (tag,text,className) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node; };
let account=null, data=null, busy=false, refreshing=false, fresh=false, pendingAction=null, latestKey='', setupKey='', actionError='';
const config=practice?null:fetch('site-config.json',{cache:'no-store'}).then(r=>{if(!r.ok) throw Error('Could not load the site settings. Refresh to try again.');return r.json();});
const message=(text,error=false)=>{ $('#draft-message').textContent=text; $('#draft-message').classList.toggle('error',error); };
async function api(path,body,identity=account) {
  if(practice)return practiceRequest(path,body,identity);
  const settings=await config;
  const response=await fetch(settings.apiBaseUrl.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(20000),
    headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),Authorization:`Bearer ${identity.code}`,
      [identity.role==='captain'?'X-Draft-Team':'X-Reviewer-Id']:identity.id},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) { const error=Error(result.error||(response.status===404?'Deploy the draft Worker update before using this page.':'Could not load or save the draft. Refresh before trying again.'));error.status=response.status;throw error; }
  return result;
}
const teamName=id=>data?.teams.find(t=>t.id===id)?.name||id;
const playerName=id=>data?.players.find(p=>p.id===id)?.player||'Unknown player';
function canPick() { return fresh&&!busy&&data?.state.status==='active'&&(account.role==='reviewer'||account.id===data.nextTeam); }
function confirmAction(title,copy,action) { pendingAction=action;$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;$('#confirm-dialog').returnValue='';$('#confirm-dialog').showModal(); }
$('#confirm-dialog form').onsubmit=event=>{event.preventDefault();const action=pendingAction;pendingAction=null;$('#confirm-dialog').close();if(event.submitter?.value==='confirm'&&action)action();};
$('#confirm-dialog').addEventListener('close',()=>{if(!$('#confirm-dialog').open)pendingAction=null;});
async function mutate(path,body) {
  const current=account; busy=true; actionError=''; render();
  let error;
  try { await api(path,body,current); }
  catch(e) { error=e; }
  finally { busy=false; }
  if(account!==current) return;
  // Always read again, including an ambiguous response: never automatically repeat a pick.
  await refresh();
  if(error) {actionError=`${error.message} Check the latest picks before trying again.`;message(actionError,true);}
}
function renderSetup() {
  const optionsKey=data.players.map(p=>`${p.id}:${p.player}`).join('|');
  if(optionsKey!==setupKey) {
    for(const id of ['vampire-captain','werewolf-captain']) {
      const select=$('#'+id), value=select.value;
      select.replaceChildren(el('option','Choose a captain…'));select.firstChild.value='';
      for(const p of data.players) {const option=el('option',p.player);option.value=p.id;select.append(option);}
      select.value=value;
    }
    setupKey=optionsKey;
  }
}
function render() {
  if(!account||!data) return;
  const state=data.state, organiser=account.role==='reviewer', waiting=state.status==='waiting';
  $('#login-panel').hidden=true;$('#draft-room').hidden=false;$('#roster-link').hidden=practice||!organiser;
  $('#identity').textContent=organiser?'Organiser · You can manage picks for either team':`${teamName(account.id)} · Captain`;
  $('#draft-setup').hidden=!organiser||!waiting; if(waiting&&organiser) renderSetup();
  $('#start-draft').disabled=busy||!fresh||data.players.length<2;
  $('#pick-number').textContent=waiting?'THE CAPTAINS ARE GATHERING':`${state.mode==='snake'?'Snake':'Alternating'} draft · ${state.status==='complete'?state.pickCount+' picks made':'Pick '+(state.pickCount+1)}`;
  $('#turn-title').textContent=waiting?'Awaiting the first pick':state.status==='complete'?'The teams are chosen':state.status==='paused'?'The draft is paused':`${teamName(data.nextTeam)} is choosing`;
  $('#turn-banner').dataset.team=data.nextTeam||'';
  $('#turn-help').textContent=!fresh?'Connection interrupted. Refresh to confirm the current turn.':waiting?'An organiser will choose the captains, draft order, and first team.':state.status==='complete'?(practice?'Practice complete. Your real roster is unchanged.':'Team assignments are saved in the roster.'):state.status==='paused'?'An organiser can resume when everyone is ready.':canPick()?'Your pick is ready. Choose a player below.':'Watch the picks appear here. Your turn is coming.';
  $('#organiser-controls').hidden=!organiser||waiting;
  $('#pause-draft').textContent=state.status==='paused'?'Resume draft':'Pause draft';
  $('#pause-draft').disabled=busy||!fresh||state.status==='complete';$('#undo-pick').disabled=busy||!fresh||!data.picks.length;
  const latest=data.picks.at(-1), key=latest?`${latest.number}:${latest.signup_id}`:'';
  $('#latest-pick').hidden=!latest;
  if(latest) $('#latest-pick').textContent=`Pick ${latest.number} · ${playerName(latest.signup_id)} joins ${teamName(latest.team_id)}`;
  if(latestKey!==key) {$('#latest-pick').classList.remove('reveal');void $('#latest-pick').offsetWidth;$('#latest-pick').classList.add('reveal');latestKey=key;}
  for(const team of data.teams) {
    const captainId=team.id==='vampire'?state.vampireCaptainId:state.werewolfCaptainId;
    const members=data.players.filter(p=>p.team_id===team.id).sort((a,b)=>a.id===captainId?-1:b.id===captainId?1:0);
    const capacity=team.id===state.firstTeam?Math.ceil(data.players.filter(p=>p.in_pool).length/2):Math.floor(data.players.filter(p=>p.in_pool).length/2);
    $('#'+team.id+'-count').textContent=waiting?`${members.length} assigned`:`${members.length} / ${capacity} players`;
    const list=$('#'+team.id+'-roster');list.replaceChildren();
    for(const p of members) {const row=el('li',p.player);const pick=data.picks.find(pick=>pick.signup_id===p.id);row.append(el('small',p.id===captainId?'CAPTAIN':pick?'Pick '+pick.number:'Assigned on roster'));list.append(row);}
    if(!members.length) list.append(el('li','Waiting for the first recruit…','empty'));
  }
  const available=data.players.filter(p=>!p.team_id&&(waiting||p.in_pool));
  $('#pool-count').textContent=`${available.length} available`;
  const query=$('#player-search').value.trim().toLowerCase();
  const pool=$('#player-pool');pool.replaceChildren();
  for(const p of available.filter(p=>`${p.player} ${p.discord}`.toLowerCase().includes(query))) {
    const card=el('article',undefined,'player-card');card.dataset.playerId=p.id;
    card.append(el('h3',p.player),el('p',p.discord,'muted'));
    const button=el('button','Choose player');button.disabled=!canPick();
    button.onclick=()=>{const revision=data.state.revision;confirmAction(`Draft ${p.player}?`,`Pick ${data.state.pickCount+1}: ${p.player} will join ${teamName(data.nextTeam)}.`,()=>mutate('/draft/pick',{signupId:p.id,revision}));};
    card.append(button);pool.append(card);
  }
  if(!pool.children.length) pool.append(el('p',available.length?'No matching participants.':'No unassigned players remain in this pool.','empty'));
  const late=data.players.filter(p=>!p.in_pool&&!p.team_id&&!waiting);$('#late-panel').hidden=!late.length;
  $('#late-list').replaceChildren(...late.map(p=>el('li',p.player)));
  $('#pick-history').replaceChildren(...[...data.picks].reverse().map(p=>el('li',`#${p.number} · ${playerName(p.signup_id)} → ${teamName(p.team_id)}`)));
}
async function refresh() {
  if(!account||refreshing) return;
  const current=account;refreshing=true;
  try {const next=await api('/draft',undefined,current);if(account!==current)return;data=next;fresh=true;render();message(actionError||`Draft updated ${new Date().toLocaleTimeString()}.`,Boolean(actionError));}
  catch(error) {if(account!==current)return;fresh=false;if(error.status===401)signout();else render();message(error.message,true);}
  finally {refreshing=false;}
}
function signout() {account=null;data=null;fresh=false;latestKey='';setupKey='';pendingAction=null;$('#confirm-dialog').close();try{sessionStorage.removeItem('bingo-draft');}catch{}$('#draft-room').hidden=true;$('#login-panel').hidden=false;for(const id of ['player-pool','vampire-roster','werewolf-roster','pick-history','late-list','vampire-captain','werewolf-captain'])$('#'+id).replaceChildren();$('#latest-pick').textContent='';$('#identity').textContent='';$('#confirm-title').textContent='';$('#confirm-copy').textContent='';$('#draft-login').reset();syncLoginRole();message('Signed out.');}
function syncLoginRole() {
  const reviewer=$('#login-role').value==='reviewer';
  $('#reviewer-field').hidden=!reviewer;
  $('#reviewer-id').required=reviewer;
  $('#reviewer-id').disabled=!reviewer;
}
$('#login-role').onchange=syncLoginRole;
window.addEventListener('pageshow',syncLoginRole);
syncLoginRole();
$('#draft-login').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||$('#draft-login button');button.disabled=true;button.textContent='Signing in...';message('Checking your access code...');
  const role=$('#login-role').value;const candidate={role:role==='reviewer'?'reviewer':'captain',id:role==='reviewer'?$('#reviewer-id').value.trim():role,code:$('#access-code').value.trim()};
  try{await api('/draft/auth',{role:candidate.role,id:candidate.id},candidate);account=candidate;actionError='';try{sessionStorage.setItem('bingo-draft',JSON.stringify(candidate));}catch{}$('#access-code').value='';await refresh();}catch(error){message(error.message,true);}finally{button.disabled=false;button.textContent='Enter draft';}
};
$('#setup-form').onsubmit=event=>{event.preventDefault();const body={revision:data.state.revision,mode:$('#draft-mode').value,firstTeam:$('#first-team').value,vampireCaptainId:$('#vampire-captain').value,werewolfCaptainId:$('#werewolf-captain').value};confirmAction('Begin the draft?',`${playerName(body.vampireCaptainId)} leads Vampire; ${playerName(body.werewolfCaptainId)} leads Werewolf. ${teamName(body.firstTeam)} picks first. ${data.players.length} signed-up players will be included.`,()=>mutate('/draft/start',body));};
$('#pause-draft').onclick=()=>mutate(data.state.status==='paused'?'/draft/resume':'/draft/pause',{revision:data.state.revision});
$('#undo-pick').onclick=()=>{const last=data.picks.at(-1),revision=data.state.revision;confirmAction('Undo the last pick?',`${playerName(last.signup_id)} will return to the player pool. Their team assignment and Discord-role checkbox will be cleared. The draft will pause.`,()=>mutate('/draft/undo',{revision}));};
$('#player-search').oninput=render;$('#refresh').onclick=refresh;$('#signout').onclick=signout;
async function poll() {try{if(!document.hidden&&!busy)await refresh();}finally{setTimeout(poll,data?.state.status==='complete'?60000:5000);}}
setTimeout(poll,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
if(practice) {
  document.title='Practice draft · Misclickas Spooky Bingo';
  $('#practice-panel').hidden=false;$('#signout').hidden=true;
  $('#draft-footer').textContent='Practice only: sample players and picks stay in this tab’s memory. Refreshing or closing the page discards them. Other tabs and the real roster are unaffected.';
  const changeView=()=>{const role=$('#practice-role').value;account={role:role==='reviewer'?'reviewer':'captain',id:role==='reviewer'?'practice':role};refresh();};
  $('#practice-role').onchange=changeView;
  $('#practice-reset').onclick=()=>confirmAction('Reset practice draft?','All practice picks will be discarded. The real draft and roster are unaffected.',()=>{practiceRequest=createPracticeDraft();actionError='';setupKey='';$('#player-search').value='';$('#practice-role').value='reviewer';changeView();});
  changeView();
} else {
  try {const saved=JSON.parse(sessionStorage.getItem('bingo-draft'));if(saved&&['captain','reviewer'].includes(saved.role)&&saved.id&&saved.code){account=saved;refresh();}}catch{}
}
