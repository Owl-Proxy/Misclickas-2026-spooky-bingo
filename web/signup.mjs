import { api, message } from './signup-api.mjs';
const form = document.querySelector('#signup-form');
const button = document.querySelector('#submit-signup');
const status = document.querySelector('#signup-message');
try {
  const { open } = await api('/signups/status');
  button.disabled = !open;
  button.textContent = open ? 'Count me in' : 'Signups are closed';
  if (!open) message(status, 'Signups are not open right now. Check with a clan organiser for the next signup window.');
} catch {
  button.textContent = 'Signups unavailable';
  message(status, 'Could not connect to signups. Please refresh and try again shortly.', true);
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = 'Saving your signup…';
  message(status, '');
  const data = new FormData(form);
  try {
    const result = await api('/signups', { player: data.get('player').trim(), discord: data.get('discord').trim(), website: data.get('website'), consent: data.has('consent') });
    form.hidden = true;
    document.querySelector('#signup-title').textContent = 'You’re on the list';
    message(status, result.message);
  } catch (error) {
    message(status, error.message, true);
    button.disabled = false;
    button.textContent = 'Try again';
  }
});
