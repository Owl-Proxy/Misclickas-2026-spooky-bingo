const settings = fetch('site-config.json', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error('Could not connect. Please refresh and try again.');
  return response.json();
});
export async function api(path, body, account) {
  const { apiBaseUrl } = await settings;
  if (!apiBaseUrl) throw new Error('Signups are not open yet. Please check back soon.');
  const response = await fetch(apiBaseUrl.replace(/\/$/, '') + path, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(account ? { Authorization: `Bearer ${account.code}`, 'X-Reviewer-Id': account.id } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save or load this request. Please try again.');
  return result;
}
export function message(element, text, error = false) {
  element.textContent = text;
  element.classList.toggle('error', error);
}
