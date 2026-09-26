import { api, message } from './signup-api.mjs';
const $ = selector => document.querySelector(selector);
let account = null, entries = [], teams = [], draftStatus = 'waiting', canEditUsernames = false, dirty = false, refreshing = false, saving = false;
const status = $('#roster-message');
const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
function signout() {
  account = null; entries = []; teams = []; dirty = false;
  $('#roster').replaceChildren(); $('#roster-panel').hidden = true; $('#login-panel').hidden = false;
  $('#login-form').reset(); $('#search').value = ''; $('#roster-count').textContent = ''; message(status, 'Signed out.');
}
function render() {
  const query = $('#search').value.toLowerCase().trim();
  $('#roster-count').textContent = `${entries.length} signed up · ${entries.filter(e => !e.team_id).length} unassigned · ${teams.map(t => `${entries.filter(e => e.team_id === t.id).length} ${t.name}`).join(' · ')}`;
  $('#roster').replaceChildren();
  const filtered = entries.filter(e => `${e.player} ${e.discord}`.toLowerCase().includes(query));
  if (!filtered.length) $('#roster').append(node('p', entries.length ? 'No matching names.' : 'No signups yet.', 'muted'));
  for (const entry of filtered) {
    const card = node('article', '', 'panel roster-entry');
    card.append(node('h3', entry.player), node('p', `Discord: ${entry.discord}`, 'muted'), node('p', `Signed up ${new Date(entry.created_at).toLocaleDateString()}`, 'field-help'));
    const form = node('form'), label = node('label', 'Team'), select = node('select');
    const nameLabel = node('label', 'OSRS username'), nameInput = node('input');
    nameInput.id = `player-${entry.id}`; nameInput.name = 'player'; nameLabel.htmlFor = nameInput.id;
    nameInput.value = entry.player; nameInput.required = true; nameInput.maxLength = 12;
    nameInput.pattern = '[a-zA-Z0-9 _\\-]{1,12}'; nameInput.autocomplete = 'off';
    nameInput.title = 'Up to 12 letters, numbers, spaces, hyphens or underscores.';
    nameInput.disabled = !canEditUsernames;
    select.id = `team-${entry.id}`; label.htmlFor = select.id;
    for (const team of [{ id: '', name: 'Unassigned' }, ...teams]) { const option = node('option', team.name); option.value = team.id; select.append(option); }
    select.value = entry.team_id;
    select.disabled = ['active','paused'].includes(draftStatus);
    const checkLabel = node('label', '', 'check'), check = node('input'); check.type = 'checkbox'; check.checked = Boolean(entry.role_assigned); check.disabled = !select.value;
    check.name = 'roleAssigned';
    checkLabel.append(check, node('span', 'Discord role assigned'));
    const paidLabel = node('label', '', 'check'), paid = node('input');
    paid.type = 'checkbox'; paid.name = 'paidEntryFee'; paid.checked = Boolean(entry.paid_entry_fee);
    paid.disabled = entry.paid_entry_fee === undefined;
    paidLabel.append(paid, node('span', 'Paid entry fee'));
    select.addEventListener('change', () => { check.checked = false; check.disabled = !select.value; });
    const button = node('button', 'Save changes'), feedback = node('p', '', 'message'); feedback.setAttribute('role', 'status');
    form.append(nameLabel, nameInput, label, select, checkLabel, paidLabel, button, feedback); card.append(form); $('#roster').append(card);
    if (!canEditUsernames) message(feedback, 'Deploy the updated Worker to enable username editing.', true);
    if (paid.disabled) message(feedback, 'Entry fee tracking is unavailable until the updated submission service is deployed.', true);
    form.addEventListener('submit', async event => {
      event.preventDefault(); button.disabled = true; saving = true; message(feedback, 'Saving…');
      const teamId = select.value, roleAssigned = check.checked, paidEntryFee = paid.checked, currentAccount = account;
      try {
        const saved = await api(`/signups/${entry.id}`, { teamId, roleAssigned, ...(nameInput.disabled ? {} : { player: nameInput.value.trim() }), ...(paid.disabled ? {} : { paidEntryFee }), revision: entry.revision }, currentAccount);
        if (account !== currentAccount) return;
        Object.assign(entry, { ...(saved.player === undefined ? {} : { player: saved.player }), team_id: teamId, role_assigned: Number(roleAssigned), ...(paid.disabled ? {} : { paid_entry_fee: Number(paidEntryFee) }), revision: saved.revision });
        dirty = false; render(); message(status, `Saved changes for ${entry.player}.`);
      } catch (error) { message(feedback, error.message, true); button.disabled = false; }
      finally { saving = false; }
    });
  }
}
async function refresh(automatic = false) {
  if (refreshing || saving || (automatic && dirty)) return;
  refreshing = true;
  const currentAccount = account;
  try {
  const data = await api('/signups', undefined, currentAccount);
  if (account !== currentAccount || (automatic && dirty)) return;
  entries = data.signups; teams = data.teams; draftStatus = data.draftStatus || 'waiting'; canEditUsernames = data.canEditUsernames === true; dirty = false; render();
  $('#login-panel').hidden = true; $('#roster-panel').hidden = false;
  message(status, (data.open ? 'Signups are open.' : 'Signups are closed.') + (['active','paused'].includes(draftStatus) ? ' Live draft in progress: team assignments update automatically. Make picks on the draft page; payment and Discord-role checkboxes remain editable.' : ''));
  } finally { refreshing = false; }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const candidate = { id: $('#reviewer-id').value.trim(), code: $('#reviewer-code').value.trim() };
  try {
    await api('/signups/auth', { reviewerId: candidate.id }, candidate);
    account = candidate; $('#reviewer-code').value = ''; await refresh();
  } catch (error) { account = null; message(status, error.message, true); }
  finally { button.disabled = false; }
});
$('#refresh').addEventListener('click', () => refresh().catch(error => { signout(); message(status, error.message, true); }));
$('#search').addEventListener('input', render);
$('#signout').addEventListener('click', signout);
$('#roster').addEventListener('input', () => { dirty = true; });
setInterval(() => { if (account && !document.hidden && !dirty && !saving) refresh(true).catch(error => message(status, error.message, true)); }, 10000);
// Keep codes and private names in memory only; refresh or sign-out clears the session.
$('#export').addEventListener('click', () => {
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const rows = [['OSRS username', 'Discord username', 'Team', 'Discord role assigned', 'Paid entry fee', 'Signed up'], ...entries.map(e => [e.player, e.discord, teams.find(t => t.id === e.team_id)?.name || 'Unassigned', e.role_assigned ? 'Yes' : 'No', e.paid_entry_fee === undefined ? 'Unknown' : e.paid_entry_fee ? 'Yes' : 'No', e.created_at])];
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = node('a'); link.href = url; link.download = 'misclickas-signups.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
