export const RETRY_LIMIT = 3;
export const RETRY_WINDOW_MS = 5 * 60 * 1000;
const cancelled = () => new DOMException('Upload retries stopped.', 'AbortError');
export function retryable(error) {
  return error?.name !== 'AbortError' && (error?.transient === true || [429, 502, 503, 504].includes(error?.status));
}
export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function stopped(error) {
  const result = new Error(`Automatic retries stopped. ${error?.message || 'The upload could not be confirmed.'}`);
  result.retryStopped = true; result.cause = error; return result;
}
// send always receives the same caller-owned payload. Only timing and cancellation change.
export async function uploadWithRetries(send, {
  signal, onState = () => {}, now = Date.now, sleep = abortableSleep, random = Math.random,
  maxRetries = RETRY_LIMIT, maxDuration = RETRY_WINDOW_MS
} = {}) {
  const deadline = now() + maxDuration;
  let attempt = 0, lastError;
  while (true) {
    if (signal?.aborted) throw cancelled();
    if (now() >= deadline) throw stopped(lastError);
    onState({ phase: 'sending', attempt, maxRetries });
    try { return await send({ signal, timeoutMs: Math.min(45000, deadline - now()) }); }
    catch (error) {
      if (signal?.aborted) throw cancelled();
      if (!retryable(error)) throw error;
      lastError = error;
      if (attempt >= maxRetries) throw stopped(error);
      const serverWait = Number(error.retryAfter);
      const delay = Math.max(Number.isFinite(serverWait) ? serverWait * 1000 : 0, Math.min(30000, 5000 * 2 ** attempt)) + 1000 + Math.floor(random() * 4000);
      const resumeAt = now() + delay;
      // Never shorten an upstream wait to fit our budget.
      if (resumeAt >= deadline) throw stopped(error);
      attempt++;
      onState({ phase: 'waiting', attempt, maxRetries, seconds: Math.ceil(delay / 1000) });
      while (now() < resumeAt) {
        if (signal?.aborted) throw cancelled();
        onState({ phase: 'countdown', attempt, maxRetries, seconds: Math.ceil((resumeAt - now()) / 1000) });
        await sleep(Math.min(1000, resumeAt - now()), signal);
      }
    }
  }
}
