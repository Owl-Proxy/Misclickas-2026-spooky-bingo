// Signups live exclusively in D1. No names are written to the public GitHub archive.
export async function handleSignups(request, env, path, teams, { authorize, limit, readJSON, text, json, fail }) {
  const db = env.SIGNUPS_DB;
  const playerName = value => {
    const player = text(value, 'OSRS username', 12);
    if (!/^[a-zA-Z0-9 _-]{1,12}$/.test(player)) fail(400, 'Use your OSRS username (up to 12 letters, numbers, spaces, hyphens or underscores).');
    const key = player.toLowerCase().replace(/[_-]/g, ' ').replace(/ +/g, ' ').trim();
    if (!key) fail(400, 'Check your OSRS username.');
    return { player, key };
  };
  const open = Boolean(db) && env.SIGNUPS_OPEN !== 'false';
  if (path === '/signups/status' && request.method === 'GET') return json({ open });
  if (!db) fail(503, 'Signups are not open yet. Please check back soon.');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (path === '/signups' && request.method === 'POST') {
    if (!open) fail(503, 'Signups are closed. Contact a clan organiser for help.');
    await limit(env.SIGNUP_RATE_LIMIT, ip);
    const body = await readJSON(request, 2048);
    const confirmation = { message: 'Thanks! Your signup has been received. If you have already signed up, your original entry is kept. Contact an organiser to make changes.' };
    if (body.website) return json(confirmation, 202); // Honeypot; never retain its contents.
    const { player, key } = playerName(body.player);
    const discord = text(body.discord, 'Discord username', 80);
    if (/[\u0000-\u001f\u007f]/.test(discord)) fail(400, 'Check your Discord username.');
    if (body.consent !== true) fail(400, 'Please confirm that organisers may use your names to organise the bingo.');
    await db.prepare(`INSERT INTO signups (id, player, player_key, discord, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_key) DO NOTHING`)
      .bind(crypto.randomUUID(), player, key, discord, new Date().toISOString()).run();
    return json(confirmation, 202);
  }
  // Every roster operation, including login, requires an existing organiser code.
  if (path === '/signups/auth' && request.method === 'POST') {
    await limit(env.AUTH_RATE_LIMIT, ip);
    const body = await readJSON(request, 2048);
    const reviewer = await authorize(request, env, 'reviewer', text(body.reviewerId, 'reviewer ID', 64));
    return json(reviewer);
  }
  const reviewer = await authorize(request, env, 'reviewer', request.headers.get('X-Reviewer-Id') || '');
  if (path === '/signups' && request.method === 'GET') {
    const { results } = await db.prepare('SELECT id, player, discord, team_id, role_assigned, paid_entry_fee, created_at, revision FROM signups ORDER BY created_at, id').all();
    const draft = await db.prepare('SELECT status FROM draft_state WHERE id = 1').all();
    return json({ signups: results, teams, open, canEditUsernames: true, draftStatus: draft.results[0]?.status || 'waiting' });
  }
  const match = path.match(/^\/signups\/([a-f0-9-]{36})$/);
  if (match && request.method === 'POST') {
    const body = await readJSON(request, 2048);
    if (body.teamId !== '' && !teams.some(team => team.id === body.teamId)) fail(400, 'Select a valid team.');
    if (typeof body.roleAssigned !== 'boolean' || (body.roleAssigned && !body.teamId)) fail(400, 'Select a team before marking its Discord role assigned.');
    if (body.paidEntryFee !== undefined && typeof body.paidEntryFee !== 'boolean') fail(400, 'Check the paid entry fee status.');
    if (!Number.isInteger(body.revision) || body.revision < 0) fail(400, 'Refresh the roster before saving.');
    const name = body.player === undefined ? null : playerName(body.player);
    // Omitted fields from older roster tabs preserve saved names and payment status.
    // Check name uniqueness inside the same update so simultaneous corrections cannot collide.
    const result = await db.prepare(`UPDATE signups SET team_id = ?, role_assigned = ?, paid_entry_fee = COALESCE(?, paid_entry_fee),
      player = COALESCE(?, player), player_key = COALESCE(?, player_key), revision = revision + 1,
      updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?
      AND (team_id = ? OR NOT EXISTS (SELECT 1 FROM draft_state WHERE status IN ('active','paused')))
      AND NOT EXISTS (SELECT 1 FROM signups other WHERE other.player_key = ? AND other.id <> ?)`)
      .bind(body.teamId, Number(body.roleAssigned), body.paidEntryFee === undefined ? null : Number(body.paidEntryFee),
        name?.player ?? null, name?.key ?? null, reviewer.id, new Date().toISOString(), match[1], body.revision, body.teamId, name?.key ?? null, match[1]).run();
    if (!result.meta.changes) {
      if (name) {
        const duplicate = await db.prepare('SELECT id FROM signups WHERE player_key = ? AND id <> ?').bind(name.key, match[1]).all();
        if (duplicate.results.length) fail(409, 'That OSRS username is already registered to another signup. Choose a different name.');
      }
      fail(409, 'This entry changed, or team assignments are locked during the draft. Refresh the roster; make draft picks on the draft page.');
    }
    return json({ revision: body.revision + 1, ...(name ? { player: name.player } : {}) });
  }
  fail(404, 'Not found.');
}
