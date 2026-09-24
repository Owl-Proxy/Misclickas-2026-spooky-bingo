// A draft pick and its roster assignment commit in one D1 batch transaction.
export function nextDraftTeam(state, players) {
  const eligible = players.filter(p => p.in_pool);
  if (!eligible.some(p => !p.team_id)) return null;
  const second = state.first_team === 'vampire' ? 'werewolf' : 'vampire';
  const turn = state.mode === 'snake' ? Math.floor((state.pick_count + 1) / 2) % 2 : state.pick_count % 2;
  const preferred = turn ? second : state.first_team;
  const capacity = id => id === state.first_team ? Math.ceil(eligible.length / 2) : Math.floor(eligible.length / 2);
  return eligible.filter(p => p.team_id === preferred).length < capacity(preferred) ? preferred : preferred === second ? state.first_team : second;
}

export async function handleDraft(request, env, path, teams, {authorize, limit, readJSON, text, json, fail}) {
  const db = env.SIGNUPS_DB;
  if (!db) fail(503, 'The signup database is not configured.');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  let role = request.headers.has('X-Draft-Team') ? 'captain' : 'reviewer';
  let id = role === 'captain' ? request.headers.get('X-Draft-Team') : request.headers.get('X-Reviewer-Id') || '';
  if (path === '/draft/auth' && request.method === 'POST') {
    await limit(env.AUTH_RATE_LIMIT, ip);
    const body = await readJSON(request, 2048);
    if (!['captain','reviewer'].includes(body.role)) fail(400, 'Choose captain or organiser sign-in.');
    role = body.role; id = text(body.id, 'Sign-in ID', 64);
  }
  if (role === 'captain' && !teams.some(t => t.id === id)) fail(401, 'Choose your captain team.');
  const identity = await authorize(request, env, role === 'captain' ? 'team' : 'reviewer', id);
  if (path === '/draft/auth' && request.method === 'POST') return json({...identity,role});
  const statement = (sql,...values) => db.prepare(sql).bind(...values);
  let snapshot;
  try {
    snapshot = await db.batch([
      statement('SELECT * FROM draft_state WHERE id = 1'),
      statement(`SELECT s.id,s.player,s.discord,s.team_id,s.role_assigned,s.paid_entry_fee,s.revision,
        CASE WHEN p.signup_id IS NULL THEN 0 ELSE 1 END AS in_pool
        FROM signups s LEFT JOIN draft_pool p ON p.signup_id = s.id ORDER BY s.player_key,s.id`),
      statement('SELECT * FROM draft_picks ORDER BY number')
    ]);
  } catch (error) {
    if (/no such table.*draft_/i.test(error.message)) fail(503, 'Apply the draft database migration, then reload this page.');
    throw error;
  }
  const state = snapshot[0].results[0], players = snapshot[1].results, picks = snapshot[2].results;
  const nextTeam = nextDraftTeam(state,players);
  const view = () => ({state:{status:state.status,mode:state.mode,firstTeam:state.first_team,pickCount:state.pick_count,
    revision:state.revision,vampireCaptainId:state.vampire_captain,werewolfCaptainId:state.werewolf_captain,updatedAt:state.updated_at},
    players:players.map(p => role === 'reviewer' ? p : Object.fromEntries(Object.entries(p).filter(([key])=>!['paid_entry_fee','role_assigned'].includes(key)))),
    picks:picks.map(({picked_by,...p})=>p),teams,nextTeam:state.status === 'waiting' ? null : nextTeam});
  if (path === '/draft' && request.method === 'GET') return json(view());
  if (request.method !== 'POST' || !['/draft/start','/draft/pick','/draft/pause','/draft/resume','/draft/undo'].includes(path)) fail(404, 'Not found.');
  if (path !== '/draft/pick' && role !== 'reviewer') fail(403, 'Only an organiser can manage the draft.');
  const body = await readJSON(request, 2048);
  if (!Number.isInteger(body.revision) || body.revision !== state.revision) fail(409, 'The draft changed. Refresh and check the current turn.');
  const operation = crypto.randomUUID(), now = new Date().toISOString(), actor = `${role}:${id}`;
  const owns = 'EXISTS (SELECT 1 FROM draft_state WHERE id = 1 AND operation_id = ?)';
  const batch = [], details = {};
  let action = path.split('/').at(-1);
  const updateState = (assignments, values, guard='', guardValues=[]) => statement(
    `UPDATE draft_state SET ${assignments}, revision = revision + 1, operation_id = ?, updated_at = ? WHERE id = 1 AND revision = ? ${guard}`,
    ...values,operation,now,state.revision,...guardValues);
  if (action === 'start') {
    if (state.status !== 'waiting') fail(409, 'This draft has already started.');
    if (!['snake','alternating'].includes(body.mode) || !teams.some(t=>t.id===body.firstTeam)) fail(400, 'Choose a draft order and first team.');
    const captains = [body.vampireCaptainId,body.werewolfCaptainId].map(id=>players.find(p=>p.id===id));
    if (!captains.every(Boolean) || captains[0].id === captains[1].id) fail(400, 'Choose two different signed-up captains.');
    const assigned = players.map(p=>({...p,team_id:p.id===captains[0].id?'vampire':p.id===captains[1].id?'werewolf':p.team_id}));
    for (const t of teams) {
      const cap = t.id === body.firstTeam ? Math.ceil(players.length/2) : Math.floor(players.length/2);
      if (assigned.filter(p=>p.team_id===t.id).length > cap) fail(409, `${t.name} already exceeds its draft capacity. Adjust existing assignments in the roster first.`);
    }
    Object.assign(details,{mode:body.mode,firstTeam:body.firstTeam,captains:captains.map(p=>p.id),participants:players.length});
    batch.push(updateState('status = ?, mode = ?, first_team = ?, vampire_captain = ?, werewolf_captain = ?',
      [assigned.some(p=>!p.team_id)?'active':'complete',body.mode,body.firstTeam,captains[0].id,captains[1].id],
      'AND (SELECT COUNT(*) FROM signups) = ? AND (SELECT COALESCE(SUM(revision),0) FROM signups) = ?',
      [players.length,players.reduce((sum,p)=>sum+p.revision,0)]));
    batch.push(statement(`INSERT INTO draft_pool (signup_id) SELECT id FROM signups WHERE ${owns}`,operation));
    for (const [index,captain] of captains.entries()) batch.push(statement(
      `UPDATE signups SET team_id = ?, role_assigned = CASE WHEN team_id = ? THEN role_assigned ELSE 0 END,
      revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND ${owns}`,
      index?'werewolf':'vampire',index?'werewolf':'vampire',actor,now,captain.id,operation));
  } else if (action === 'pick') {
    if (state.status !== 'active' || !nextTeam) fail(409, 'The draft is not accepting picks right now.');
    if (role === 'captain' && id !== nextTeam) fail(403, 'It is the other captain’s turn.');
    const player = players.find(p=>p.id===body.signupId && p.in_pool && !p.team_id);
    if (!player) fail(409, 'This player is not available to draft. Refresh the player pool.');
    Object.assign(details,{signupId:player.id,teamId:nextTeam,number:state.pick_count+1});
    const last = players.filter(p=>p.in_pool&&!p.team_id).length === 1;
    batch.push(updateState('pick_count = pick_count + 1, status = ?', [last?'complete':'active'],
      "AND EXISTS (SELECT 1 FROM signups WHERE id = ? AND revision = ? AND team_id = '')",[player.id,player.revision]));
    batch.push(statement(`INSERT INTO draft_picks (number,signup_id,team_id,picked_by,picked_at)
      SELECT ?,?,?,?,? WHERE ${owns}`,state.pick_count+1,player.id,nextTeam,actor,now,operation));
    batch.push(statement(`UPDATE signups SET team_id = ?, role_assigned = 0, revision = revision + 1,
      updated_by = ?, updated_at = ? WHERE id = ? AND ${owns}`,nextTeam,actor,now,player.id,operation));
  } else if (action === 'undo') {
    const last = picks.at(-1), player = players.find(p=>p.id===last?.signup_id);
    if (!last || player?.team_id !== last.team_id) fail(409, 'The last pick cannot be undone because its roster assignment changed.');
    Object.assign(details,{number:last.number,signupId:last.signup_id,teamId:last.team_id});
    batch.push(updateState("pick_count = pick_count - 1, status = 'paused'", [],
      'AND EXISTS (SELECT 1 FROM signups WHERE id = ? AND revision = ? AND team_id = ?)',[player.id,player.revision,last.team_id]));
    batch.push(statement(`DELETE FROM draft_picks WHERE number = ? AND ${owns}`,last.number,operation));
    batch.push(statement(`UPDATE signups SET team_id = '', role_assigned = 0, revision = revision + 1,
      updated_by = ?, updated_at = ? WHERE id = ? AND ${owns}`,actor,now,player.id,operation));
  } else {
    const desired = action === 'pause' ? 'paused' : 'active';
    if (state.status !== (action === 'pause'?'active':'paused')) fail(409, 'The draft status changed. Refresh before continuing.');
    batch.push(updateState('status = ?', [desired]));
  }
  batch.push(statement(`INSERT INTO draft_audit (id,action,actor,details,created_at) SELECT ?,?,?,?,? WHERE ${owns}`,
    operation,action,actor,JSON.stringify(details),now,operation));
  const result = await db.batch(batch);
  if (!result[0].meta.changes) fail(409, 'The roster or draft changed. Refresh before trying again.');
  return json({revision:state.revision+1,action,...details});
}
