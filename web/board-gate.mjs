const gate = document.querySelector('#board-gate');
const form = document.querySelector('#gate-form');
const status = document.querySelector('#gate-status');
const board = document.querySelector('#board-app');
let settings;
let launching = false;
let opened = false;
let state, checkedAt = 0, serverNow = 0, nextCheck = Infinity, checking = false, timer;
const countdown = document.querySelector('#reveal-countdown');
function showError(message) {
  (gate.hidden ? document.querySelector('#service-status') : status).textContent = message;
}
async function checkAccess() {
  if (checking || opened) return;
  checking = true;
  // Network checks are at most once a minute, apart from the scheduled reveal.
  nextCheck = performance.now() + 60000;
  try {
    const response = await fetch(settings.apiBaseUrl.replace(/\/$/, '') + '/board/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not check board access. Please refresh shortly.');
    state = await response.json();
    checkedAt = performance.now();
    serverNow = Date.parse(state.serverTime) || Date.now();
    const revealAt = Date.parse(state.revealAt);
    countdown.hidden = state.public === true || !Number.isFinite(revealAt) || revealAt <= serverNow;
    if (!countdown.hidden) {
      document.querySelector('#reveal-date').textContent = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(revealAt);
      if (revealAt > serverNow) nextCheck = Math.min(nextCheck, checkedAt + revealAt - serverNow);
    }
    if (state.public === true) {
      gate.hidden = true; board.hidden = false;
      document.querySelector('#service-status').textContent = 'Loading the boards…';
      await unlock();
    } else {
      gate.hidden = false; board.hidden = true; form.hidden = false;
      status.textContent = 'Organisers can preview with their existing reviewer credentials.';
    }
  } catch (error) { showError(`${error.message} Access will be checked again shortly.`); }
  finally { checking = false; }
}
function tick() {
  if (opened || document.hidden) return;
  const remaining = Math.max(0, Math.ceil((Date.parse(state?.revealAt) - serverNow - (performance.now() - checkedAt)) / 1000));
  if (Number.isFinite(remaining)) {
    const values = { days: Math.floor(remaining / 86400), hours: Math.floor(remaining / 3600) % 24, minutes: Math.floor(remaining / 60) % 60, seconds: remaining % 60 };
    for (const [unit, value] of Object.entries(values)) document.querySelector(`#reveal-${unit}`).textContent = String(value).padStart(2, '0');
    document.querySelector('#reveal-message').textContent = remaining > 0
      ? 'The board will open automatically. Let the haunting begin.'
      : 'Checking the doors… The board will open as soon as access is confirmed.';
  }
  if (performance.now() >= nextCheck) void checkAccess();
}
document.addEventListener('visibilitychange', tick);
window.addEventListener('pageshow', tick);
async function unlock(account) {
  if (launching) return;
  launching = true;
  try {
    const headers = account ? { Authorization: `Bearer ${account.code}`, 'X-Reviewer-Id': account.id } : {};
    const response = await fetch(settings.apiBaseUrl.replace(/\/$/, '') + '/config', { headers, cache: 'no-store' });
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Could not open the board.');
    if (account) { try { sessionStorage.setItem('bingo-reviewer', JSON.stringify(account)); } catch {} }
    // Only import the application once the server has granted access to the tiles.
    const { start } = await import('./app.mjs');
    await start({ settings, service: config, account });
    gate.hidden = true;
    opened = true;
    clearInterval(timer);
    board.hidden = false;
  } catch (error) { showError(error.message); if (!gate.hidden) form.hidden = false; }
  finally { launching = false; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  await unlock({ id: form.elements.reviewerId.value.trim(), code: form.elements.code.value.trim(), name: form.elements.reviewerId.value.trim() });
  form.elements.code.value = ''; button.disabled = false;
});
try {
  const response = await fetch('site-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not check board access. Please refresh shortly.');
  settings = await response.json();
  if (!settings.apiBaseUrl) throw new Error('The board is not available yet. Signups have their own page above.');
  await checkAccess();
  let saved; try { saved = JSON.parse(sessionStorage.getItem('bingo-reviewer')); } catch {}
  if (!opened && saved) await unlock(saved);
  if (!opened) { timer = setInterval(tick, 1000); tick(); }
} catch (error) { showError(error.message); }
