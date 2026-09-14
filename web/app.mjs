import { buildTiles, tileProgress, summary } from '../shared/bingo.mjs';

const $ = selector => document.querySelector(selector);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const message = (selector, text = '', error = false) => { $(selector).textContent = text; $(selector).classList.toggle('error', error); };
const session = {
  get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch { /* Sign-in still works in memory when storage is unavailable. */ } }
};
let settings, tiles = [], team = null, submissions = [], ready = false, loaded = false, generation = 0, refreshSequence = 0;
let selectedTile, selectedSubmission, loginRole, loginTeam, previewURL, uploadId, uploading = false;
let teamCodes = session.get('bingo-team-codes') || {}, reviewer = session.get('bingo-reviewer');
const teamURL = id => { const url = new URL(location.href); url.searchParams.set('team', id); url.hash = ''; return url; };
const field = (form, name) => $(form).elements.namedItem(name);
const date = value => new Date(value).toLocaleString();
const bonusLabel = points => `${points.toLocaleString()} bonus ${points === 1 ? 'point' : 'points'}`;

async function api(path, body, auth) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) { headers.Authorization = `Bearer ${auth.code}`; if (auth.id) headers['X-Reviewer-Id'] = auth.id; }
  const response = await fetch(settings.apiBaseUrl.replace(/\/$/, '') + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', signal: AbortSignal.timeout(45000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}
function authButtons() {
  $('#team-login').disabled = !ready;
  $('#reviewer-login').disabled = !ready;
  $('#team-login').textContent = teamCodes[team?.id] ? 'Team sign out' : 'Team sign in';
  $('#reviewer-login').textContent = reviewer ? `${reviewer.name} · Sign out` : 'Reviewer sign in';
}
function renderTeams() {
  $('#teams').replaceChildren(...settings.teams.map(value => {
    const link = node('a'); link.href = teamURL(value.id); link.dataset.team = value.id;
    link.style.setProperty('--team-color', value.color);
    if (team?.id === value.id) link.setAttribute('aria-current', 'page');
    link.append(node('span', value.symbol, 'sigil'), node('span', value.name));
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); history.pushState(null, '', link.href); selectTeam();
    });
    return link;
  }));
}
async function selectTeam() {
  generation++; refreshSequence++;
  const id = new URL(location.href).searchParams.get('team');
  team = settings.teams.find(value => value.id === id) || null;
  submissions = []; loaded = false; selectedTile = null;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('#team-board').hidden = $('#team-tools').hidden = !team;
  $('#team-title').textContent = team ? `${team.name}'s board` : 'Choose your team';
  document.title = team ? `${team.name} · Misclickas Spooky Bingo` : 'Misclickas Spooky Bingo';
  if (team) document.documentElement.style.setProperty('--accent', team.color);
  renderTeams(); authButtons(); render();
  if (!ready) message('#service-status', settings.apiBaseUrl ? 'The submission service is unavailable. You can still explore the tiles.' : 'Submissions aren’t open yet. You can explore both team boards.');
  else if (team) await refresh();
  else message('#service-status', 'Choose a team to view its progress and submissions.');
}
async function refresh() {
  if (!team || !ready) return;
  const current = generation, sequence = ++refreshSequence, id = team.id;
  try {
    if (!loaded) message('#service-status', 'Loading team progress…');
    const data = await api(`/teams/${id}`);
    if (current !== generation || sequence !== refreshSequence) return;
    if (data.teamId !== id) throw new Error('The service returned the wrong team. Please refresh.');
    submissions = data.submissions.filter(s => s.teamId === id); loaded = true;
    message('#service-status', `Progress updated ${new Date().toLocaleTimeString()}. Only approved evidence counts.`);
    render();
  } catch (error) {
    if (current === generation && sequence === refreshSequence) message('#service-status', `${error.message} ${loaded ? 'Showing the last loaded progress.' : 'Progress could not be loaded.'}`, true);
  }
}
function render() {
  if (!team) return;
  const score = summary(tiles, submissions);
  $('#score').replaceChildren(node('strong', loaded ? `${score.complete} / ${score.total} tiles complete` : 'Progress unavailable'), node('span', loaded ? bonusLabel(score.bonusPoints) : ''), node('span', loaded ? `${score.pending} pending review` : ''));
  $('#history-title').textContent = `${team.name} submissions`;
  $('#refresh').disabled = !ready;
  renderBoard(); renderHistory($('#history'), submissions.filter(s => $('#history-filter').value === 'all' || s.status === $('#history-filter').value));
  if (selectedTile && $('#tile-dialog').open) renderTile();
}
function renderBoard() {
  const doc = $('#board').contentDocument;
  if (!doc || !team) return;
  const groups = [...doc.querySelectorAll('g.tile')];
  if (groups.length !== tiles.length) return;
  groups.forEach((group, index) => {
    const tile = tiles[index], progress = tileProgress(tile, submissions);
    group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
    const state = tile.bonus ? (loaded ? bonusLabel(progress.bonusPoints) : 'Bonus points unavailable') : tile.free || (loaded && progress.complete) ? 'Complete' : loaded && progress.pending ? 'Pending review' : loaded && progress.approved ? 'Progress' : '';
    group.setAttribute('aria-label', `${team.name}: ${tile.title}${state ? ` — ${state}` : ''}. View tile.`);
    group.style.cursor = 'pointer';
    group.onclick = () => openTile(tile);
    group.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); openTile(tile); } };
    group.querySelector('.progress-badge')?.remove();
    if (state) {
      const rect = group.querySelector('rect');
      const badge = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); badge.classList.add('progress-badge'); badge.setAttribute('pointer-events', 'none');
      const x = Number(rect.getAttribute('x')) + 7, y = Number(rect.getAttribute('y')) + 7;
      const background = doc.createElementNS(badge.namespaceURI, 'rect');
      const badgeLabel = tile.bonus ? (loaded ? `+${bonusLabel(progress.bonusPoints)}` : 'Bonus points unavailable') : state === 'Complete' ? '✓ Complete' : state === 'Progress' ? '◐ Progress' : '⏳ Pending';
      for (const [key, value] of Object.entries({ x, y, width: tile.bonus ? Math.max(110, badgeLabel.length * 7 + 12) : 83, height: 22, rx: 4, fill: '#100b0e', stroke: state === 'Complete' ? '#9ce1b1' : '#f5c979' })) background.setAttribute(key, value);
      const text = doc.createElementNS(badge.namespaceURI, 'text');
      for (const [key, value] of Object.entries({ x: x + 6, y: y + 15, fill: state === 'Complete' ? '#9ce1b1' : '#f5c979', 'font-size': 11, 'font-family': 'sans-serif', 'font-weight': 700 })) text.setAttribute(key, value);
      text.textContent = badgeLabel;
      badge.append(background, text); group.append(badge);
    }
  });
}
function renderRequirements(target, tile) {
  target.replaceChildren();
  if (tile.free) { target.append(node('p', 'A free space for both teams. Happy haunting!')); return; }
  const progress = tileProgress(tile, submissions);
  if (tile.bonus) {
    target.append(node('h3', loaded ? bonusLabel(progress.bonusPoints) : 'Bonus points unavailable'));
    const card = node('div', undefined, 'path');
    tile.legacyRequirements.forEach(value => card.append(node('p', value)));
    card.append(node('p', 'Only listed drops from board tiles qualify. Each team can earn one bonus point per tile, whether it is complete or incomplete. Submit the screenshot to the normal tile separately if it also counts toward completion.', 'muted'));
    if (loaded) card.append(node('p', `${progress.approved} approved ${progress.approved === 1 ? 'entry' : 'entries'} · ${progress.pending} pending review`, 'muted'));
    if (progress.creditedTileIds.length) card.append(node('p', `Bonuses earned: ${progress.creditedTileIds.map(id => tile.sources.find(source => source.id === id).title).join(' · ')}`));
    target.append(card);
    return;
  }
  target.append(node('h3', progress.complete && loaded ? '✓ Tile complete' : 'Completion requirements'));
  if (tile.paths) {
    progress.paths.forEach((path, index) => {
      if (index) target.append(node('p', 'OR', 'or'));
      const card = node('div', undefined, 'path');
      if (path.length > 1) card.append(node('p', 'All of the following:', 'path-heading'));
      path.forEach(group => {
        card.append(node('p', `${group.quantity} × ${group.label}${group.items.length > 1 ? ` (${group.items.join(' / ')})` : ''}`));
        card.append(node('p', loaded ? `${Math.min(group.current, group.quantity)} / ${group.quantity} approved` : 'Approved progress unavailable', loaded && group.current >= group.quantity ? 'met' : 'muted'));
      });
      target.append(card);
    });
  } else {
    const card = node('div', undefined, 'path');
    tile.legacyRequirements.forEach(value => card.append(node('p', value)));
    target.append(card, node('p', 'An organiser confirms when this tile’s requirements are met.', 'muted'));
    if (loaded && progress.approved) target.append(node('p', `Approved evidence: ${tile.choices.map(c => `${progress.counts[c.id] || 0} × ${c.label}`).join(' · ')}`, 'muted'));
  }
}
function openTile(tile) {
  if (!team) return;
  selectedTile = tile; uploadId = null;
  $('#upload-form').reset(); message('#upload-status');
  if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; $('#upload-preview').hidden = true;
  field('#upload-form', 'choiceId').replaceChildren(...tile.choices.map(choice => { const option = node('option', tile.bonus && choice.id === 'activity-progress' ? 'Qualifying unique drop or pet' : choice.label); option.value = choice.id; return option; }));
  renderTile(); $('#tile-dialog').showModal();
}
function renderTile() {
  $('#tile-team').textContent = team.name; $('#tile-title').textContent = selectedTile.title; $('#tile-source').textContent = selectedTile.source;
  renderRequirements($('#requirements'), selectedTile);
  $('#upload-form').hidden = Boolean(selectedTile.free);
  $('#bonus-source-label').hidden = !selectedTile.bonus;
  const quantity = field('#upload-form', 'quantity');
  quantity.readOnly = Boolean(selectedTile.bonus); quantity.max = selectedTile.bonus ? '1' : '10000';
  if (selectedTile.bonus) { quantity.value = '1'; renderBonusChoices(); }
  const noBonusChoices = selectedTile.bonus && !field('#upload-form', 'choiceId').value;
  $('#upload-fields').disabled = !ready || !teamCodes[team.id] || uploading || noBonusChoices;
  message('#upload-hint', !ready ? 'Submissions aren’t open yet.' : !teamCodes[team.id] ? 'Close this tile and use Team sign in to submit evidence.' : noBonusChoices ? 'Every eligible tile has a pending or approved bonus claim.' : selectedTile.bonus ? 'Choose a board tile and its listed drop. Include the time received and time zone in Notes, with a screenshot showing the drop and clock. An organiser will verify the midnight–1 a.m. window. One bonus per tile per team.' : 'Submit one drop or activity per screenshot entry. An organiser will review it.');
  renderHistory($('#tile-history'), submissions.filter(s => s.tileId === selectedTile.id));
}
function renderBonusChoices() {
  const sourceField = field('#upload-form', 'bonusSource'), dropField = field('#upload-form', 'choiceId');
  const oldSource = sourceField.value, oldDrop = dropField.value;
  const claimed = new Set(submissions.filter(s => s.tileId === selectedTile.id && s.status !== 'rejected').map(s => selectedTile.choices.find(c => c.id === s.choiceId)?.sourceTileId));
  sourceField.replaceChildren(...(selectedTile.sources ?? []).map(source => {
    const option = node('option', `${source.title}${claimed.has(source.id) ? ' — bonus claimed / pending' : ''}`);
    option.value = source.id; option.disabled = claimed.has(source.id); return option;
  }));
  sourceField.value = [...sourceField.options].find(o => o.value === oldSource && !o.disabled)?.value || [...sourceField.options].find(o => !o.disabled)?.value || '';
  dropField.replaceChildren(...selectedTile.choices.filter(c => c.sourceTileId === sourceField.value).map(choice => {
    const option = node('option', choice.dropLabel); option.value = choice.id; return option;
  }));
  if ([...dropField.options].some(o => o.value === oldDrop)) dropField.value = oldDrop;
}
field('#upload-form', 'bonusSource').addEventListener('change', () => { uploadId = null; renderBonusChoices(); });
function renderHistory(target, entries) {
  target.replaceChildren();
  if (!loaded || !entries.length) { target.append(node('p', !loaded ? 'Submission history is unavailable.' : 'No submissions yet.', 'empty')); return; }
  const list = node('div', undefined, 'evidence-list');
  [...entries].reverse().forEach(submission => {
    const tile = tiles.find(t => t.id === submission.tileId);
    const button = node('button', undefined, 'evidence'); button.type = 'button';
    button.append(node('span', submission.status, `badge ${submission.status}`), node('strong', tile?.title || submission.tileId), node('div', `${submission.quantity} × ${tile?.choices.find(c => c.id === submission.choiceId)?.label || submission.choiceId}`), node('div', `${submission.player} · ${date(submission.createdAt)}`, 'muted'));
    if (tile?.bonus) button.append(node('div', tileProgress(tile, submissions).creditedSubmissionIds.includes(submission.id) ? '+1 bonus point awarded' : 'No bonus points awarded'));
    button.addEventListener('click', () => openReview(submission)); list.append(button);
  });
  target.append(list);
}
function openReview(submission) {
  selectedSubmission = submission;
  const tile = tiles.find(t => t.id === submission.tileId);
  $('#review-team').textContent = team.name; $('#review-title').textContent = tile.title;
  $('#review-detail').replaceChildren(node('span', submission.status, `badge ${submission.status}`), node('p', `${submission.player} — ${submission.quantity} × ${tile.choices.find(c => c.id === submission.choiceId)?.label}`), node('p', submission.notes), node('p', date(submission.createdAt), 'muted'));
  renderRequirements($('#review-detail').appendChild(node('div')), tile);
  // Construct the image route ourselves; never navigate to a submitted URL.
  const imageURL = settings.apiBaseUrl.replace(/\/$/, '') + `/images/${encodeURIComponent(team.id)}/${encodeURIComponent(submission.id)}`;
  $('#full-image').href = $('#review-image').src = imageURL;
  $('#review-form').hidden = !reviewer; $('#review-fields').disabled = false; $('#review-form').reset();
  field('#review-form', 'status').value = submission.status === 'pending' ? 'approved' : submission.status;
  field('#review-form', 'completesTile').checked = submission.completesTile;
  $('#manual-completion').hidden = Boolean(tile.paths || tile.bonus);
  field('#review-form', 'completesTile').disabled = Boolean(tile.paths || tile.bonus);
  if (tile.bonus) $('#review-detail').append(node('p', 'Verify this is a listed drop for the selected board tile, received between midnight and 1 a.m. in the stated time zone. Approval awards that tile’s one bonus point, regardless of completion. Older entries without a board tile must be rejected and resubmitted.', 'muted'));
  message('#review-status');
  $('#review-audit').replaceChildren(...submission.reviews.map(review => node('p', `${review.reviewer}: ${review.from} → ${review.to} · ${date(review.at)}${review.reason ? ` — ${review.reason}` : ''}`, 'audit')));
  if (!submission.reviews.length) $('#review-audit').append(node('p', 'Awaiting the first review.', 'muted'));
  $('#review-dialog').showModal();
}
function openLogin(role) {
  loginRole = role; loginTeam = team?.id;
  $('#login-form').reset(); message('#login-status');
  $('#login-title').textContent = role === 'team' ? `${team.name} sign in` : 'Reviewer sign in';
  $('#reviewer-id-label').hidden = role !== 'reviewer'; field('#login-form', 'reviewerId').required = role === 'reviewer';
  $('#login-dialog').showModal();
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#login-form button'); button.disabled = true;
  const role = loginRole, id = loginTeam, code = field('#login-form', 'code').value;
  try {
    const identity = await api(`/auth/${role}`, role === 'team' ? { teamId: id } : { reviewerId: field('#login-form', 'reviewerId').value.trim() }, { code });
    if (role === 'team') { teamCodes[id] = code; session.set('bingo-team-codes', teamCodes); }
    else { reviewer = { ...identity, code }; session.set('bingo-reviewer', reviewer); }
    field('#login-form', 'code').value = ''; $('#login-dialog').close(); authButtons(); render();
  } catch (error) { message('#login-status', error.message, true); }
  finally { button.disabled = false; }
});
$('#team-login').onclick = () => {
  if (teamCodes[team.id]) { delete teamCodes[team.id]; session.set('bingo-team-codes', teamCodes); authButtons(); }
  else openLogin('team');
};
$('#reviewer-login').onclick = () => {
  if (reviewer) { reviewer = null; session.set('bingo-reviewer', null); authButtons(); }
  else openLogin('reviewer');
};
async function prepareImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP screenshot.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a screenshot smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 80000000) throw new Error('This screenshot is too large. Crop it to the game window.');
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .9));
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('Crop this screenshot further so it fits within 3 MB.');
    const dataURL = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { type: blob.type, base64: dataURL.split(',')[1] };
  } finally { bitmap.close(); }
}
$('#upload-form').addEventListener('input', () => { uploadId = null; });
field('#upload-form', 'screenshot').addEventListener('change', event => {
  if (previewURL) URL.revokeObjectURL(previewURL);
  const file = event.target.files[0]; $('#upload-preview').hidden = !file;
  if (file) $('#upload-preview').src = previewURL = URL.createObjectURL(file);
});
$('#upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (uploading || !ready || !teamCodes[team.id]) return;
  const current = generation, teamId = team.id, tile = selectedTile, code = teamCodes[teamId];
  uploadId ||= crypto.randomUUID(); const submissionId = uploadId;
  const values = new FormData($('#upload-form'));
  uploading = true; $('#upload-fields').disabled = true; message('#upload-status', 'Preparing and saving your screenshot…');
  try {
    const image = await prepareImage(values.get('screenshot'));
    await api(`/teams/${teamId}/submissions`, { id: submissionId, tileId: tile.id, choiceId: values.get('choiceId'), quantity: Number(values.get('quantity')), player: values.get('player'), notes: values.get('notes'), image }, { code });
    if (generation === current && selectedTile?.id === tile.id) {
      $('#upload-form').reset(); $('#upload-preview').hidden = true; uploadId = null;
      message('#upload-status', 'Screenshot saved. It is pending organiser review.'); await refresh();
    }
  } catch (error) { if (generation === current && selectedTile?.id === tile.id) message('#upload-status', error.message, true); }
  finally { uploading = false; if (selectedTile && team) renderTile(); }
});
$('#review-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!reviewer) return;
  const current = generation, teamId = team.id, submission = selectedSubmission, values = new FormData($('#review-form'));
  if (values.get('status') === 'rejected' && !values.get('reason').trim()) { message('#review-status', 'Add a reason so the team knows what to fix.', true); return; }
  $('#review-fields').disabled = true; message('#review-status', 'Saving decision…');
  try {
    await api(`/teams/${teamId}/submissions/${submission.id}/review`, { status: values.get('status'), revision: submission.revision, reason: values.get('reason'), completesTile: values.has('completesTile') }, reviewer);
    if (generation === current) { $('#review-dialog').close(); await refresh(); }
  } catch (error) { if (generation === current) message('#review-status', `${error.message} Close this evidence and refresh to load the latest version.`, true); }
  finally { $('#review-fields').disabled = false; }
});
document.querySelectorAll('.close').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
$('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText(teamURL(team.id).href); message('#service-status', `${team.name} link copied.`); } catch { message('#service-status', `Team link: ${teamURL(team.id).href}`); } };
$('#refresh').onclick = refresh; $('#history-filter').onchange = render;
$('#tile-select').onchange = event => { const tile = tiles.find(t => t.id === event.target.value); if (tile) openTile(tile); event.target.value = ''; };
$('#board').addEventListener('load', renderBoard);
window.addEventListener('popstate', () => { if (settings) selectTeam(); });
setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) refresh(); }, 30000);
async function start() {
  try {
    const [configResponse, eventResponse] = await Promise.all([fetch('site-config.json', { cache: 'no-store' }), fetch('october-bingo-ideas.json')]);
    if (!configResponse.ok || !eventResponse.ok) throw new Error('The board files could not be loaded.');
    settings = await configResponse.json(); tiles = buildTiles(await eventResponse.json());
    if (settings.apiBaseUrl) {
      try { const service = await api('/config'); settings.teams = service.teams; tiles = service.tiles; ready = service.ready; }
      catch { ready = false; }
    }
    $('#tile-select').append(...tiles.filter(t => !t.free).map(tile => { const option = node('option', tile.title); option.value = tile.id; return option; }));
    await selectTeam();
  } catch (error) { message('#service-status', error.message, true); }
}
start();
