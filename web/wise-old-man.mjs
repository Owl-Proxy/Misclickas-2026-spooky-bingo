const saved = new Map();
export function clearTrackingChecks() {
  saved.clear();
  document.querySelectorAll('.tracking-check').forEach(panel => panel.remove());
}
const element = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
const when = value => value ? new Date(value).toLocaleString() : 'Unavailable';

export function renderTrackingCheck(target, { teamId, tileId, player, load }) {
  const key = `${teamId}/${tileId}`;
  const panel = element('section'); panel.className = 'path tracking-check';
  panel.append(element('h3', 'Wise Old Man cross-check'));
  const button = element('button', 'Check tracked progress'); button.type = 'button'; button.className = 'quiet';
  const status = element('p'); status.setAttribute('role', 'status');
  const result = element('div');
  panel.append(button, status, result); target.append(panel);
  const show = data => {
    result.replaceChildren();
    const link = element('a', 'Open competition'); link.href = data.competitionUrl; link.target = '_blank'; link.rel = 'noopener';
    result.append(link, element('p', `Event: ${when(data.startsAt)} – ${when(data.endsAt)} (your local time).`));
    if (data.phase === 'upcoming') result.append(element('p', 'The competition has not started. Event gains are not available yet.'));
    else if (!data.players.length) result.append(element('p', `No players are assigned to ${data.teamName} in this competition. Check the Wise Old Man team roster.`));
    else if (data.total === null) result.append(element('p', `${data.knownTotal} known ${data.label.toLowerCase()} gained; ${data.missingPlayers} player(s) have missing or unranked starting/ending counts. This is not a complete team total.`));
    else result.append(element('p', `${data.teamName}: ${data.total} ${data.label.toLowerCase()} gained during the competition. Tile target: ${data.target}.`));
    if (data.phase === 'ended') result.append(element('p', 'The competition has ended. Check that participants saved a final update before the cutoff.'));
    const normalize = name => String(name || '').replaceAll('_',' ').trim().toLowerCase();
    if (player && !data.players.some(p => normalize(p.username) === normalize(player))) {
      result.append(element('p', `${player} is not listed on this Wise Old Man team. Check the username and team assignment before using these counts.`));
    }
    const list = element('ul');
    for (const p of data.players) {
      const row = element('li', `${p.displayName}: ${p.gained === null ? 'starting/ending counts unavailable' : `${p.start} → ${p.end} (+${p.gained})`}. Player last updated: ${when(p.updatedAt)}.`);
      if (player && normalize(p.username) === normalize(player)) row.style.fontWeight = '700';
      list.append(row);
    }
    result.append(list);
    if (data.note) result.append(element('p', data.note));
    const reminder = element('p', 'Supporting evidence only. These are whole-event gains, not additional credit for each submission. Check earlier approvals to avoid counting the same activity twice. Team membership comes from Wise Old Man.');
    reminder.className = 'muted'; result.append(reminder);
    const timestamp = element('p', `Fetched ${when(data.fetchedAt)}. Checks may reuse a result for up to one minute; this does not update players on Wise Old Man.`);
    timestamp.className = 'muted'; result.append(timestamp);
  };
  if (saved.has(key)) show(saved.get(key));
  button.onclick = async () => {
    button.disabled = true; status.textContent = 'Checking Wise Old Man…';
    try {
      const data = await load();
      if (data.teamId !== teamId || data.tileId !== tileId) throw new Error('The tracking response did not match this team and tile.');
      if (!panel.isConnected) return;
      saved.set(key, data); show(data); status.textContent = 'Tracked progress loaded. Approval is still required.';
    } catch (error) {
      if (!panel.isConnected) return;
      result.replaceChildren(); saved.delete(key); status.textContent = error.message; // Never disguise an outage as zero.
    } finally { button.disabled = false; }
  };
}
