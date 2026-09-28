// Require an explicit timezone; malformed or missing schedules keep the gate locked.
export function boardAccess(env, now = Date.now()) {
  const value = env.BOARD_REVEAL_AT;
  const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const revealAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  return { public: env.BOARD_PUBLIC === 'true' || (revealAt !== null && now >= timestamp), revealAt, serverTime: new Date(now).toISOString() };
}
