const gate = document.querySelector('#board-gate');
const form = document.querySelector('#gate-form');
const status = document.querySelector('#gate-status');
let settings;
let launching = false;
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
    document.querySelector('#board-app').hidden = false;
  } catch (error) { status.textContent = error.message; form.hidden = false; }
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
  const stateResponse = await fetch(settings.apiBaseUrl.replace(/\/$/, '') + '/board/status', { cache: 'no-store' });
  if (!stateResponse.ok) throw new Error('Could not check board access. Please refresh shortly.');
  const state = await stateResponse.json();
  let saved; try { saved = JSON.parse(sessionStorage.getItem('bingo-reviewer')); } catch {}
  if (state.public === true || saved) await unlock(saved);
  else { form.hidden = false; status.textContent = 'Organisers can preview with their existing reviewer credentials.'; }
} catch (error) { status.textContent = error.message; }
