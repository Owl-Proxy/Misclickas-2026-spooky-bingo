// Read-only corroboration. These counts never create submissions or award points.
export const trackedTiles = {
  'the-crypt-keeper': { metric: 'barrows_chests', label: 'Barrows chests', target: 50 },
  'fists-of-fury': { metric: 'barrows_chests', label: 'Barrows chests', target: 3,
    note: 'These counts include all Barrows chests. Screenshots or a recording must still establish that the three claimed chests were completed without equipped weapons.' },
  'the-hungry-chest': { metric: 'mimic', label: 'Mimic completions', target: 10,
    note: 'Counts support the ten-completion route only. The rare-reward route still requires drop evidence.' },
  'bone-collector': { metric: 'prayer', label: 'Prayer XP', target: null,
    note: 'Prayer XP includes all sources during the competition. It cannot confirm the bone type, number of offerings, or use of the Chaos Altar. Screenshots or a recording must still support offering 100 dragon bones or better at the Chaos Altar; XP alone does not complete this tile.' }
};

export class TrackingError extends Error {
  constructor(message, retryAfter = 60) { super(message); this.retryAfter = retryAfter; }
}

export function competitionView(data, competitionId, team, tileId, fetchedAt, now = Date.now()) {
  const tracking = trackedTiles[tileId];
  const start = Date.parse(data.startsAt), end = Date.parse(data.endsAt);
  if (!tracking || data.id !== competitionId || data.type !== 'team' || !Array.isArray(data.participations)
    || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new TrackingError('Wise Old Man returned unexpected competition data. Please check the competition setup.');
  }
  const phase = now < start ? 'upcoming' : now >= end ? 'ended' : 'active';
  const names = new Set(), ids = new Set();
  const normalize = name => String(name ?? '').replaceAll('_', ' ').trim().toLowerCase();
  for (const p of data.participations) {
    if (!Number.isInteger(p.playerId) || !p.player?.username || names.has(normalize(p.player.username)) || ids.has(p.playerId)) {
      throw new TrackingError('Wise Old Man returned an incomplete or duplicated roster. Check the competition before reviewing gains.');
    }
    ids.add(p.playerId); names.add(normalize(p.player.username));
  }
  const players = data.participations.filter(p => normalize(p.teamName) === normalize(team.name)).map(p => {
    const values = p.deltas?.find(delta => delta.metric === tracking.metric)?.values;
    const valid = values && ['start','end','gained'].every(key => Number.isSafeInteger(values[key]) && values[key] >= 0)
      && values.end >= values.start && values.gained === values.end - values.start;
    return {
      username: p.player.username, displayName: p.player.displayName || p.player.username,
      updatedAt: Number.isFinite(Date.parse(p.player.updatedAt)) ? p.player.updatedAt : null,
      start: valid && phase !== 'upcoming' ? values.start : null,
      end: valid && phase !== 'upcoming' ? values.end : null,
      gained: valid && phase !== 'upcoming' ? values.gained : null
    };
  });
  const validPlayers = players.filter(p => p.gained !== null);
  return {
    competitionId, title: data.title, competitionUrl: `https://wiseoldman.net/competitions/${competitionId}`,
    startsAt: data.startsAt, endsAt: data.endsAt, fetchedAt, phase,
    teamId: team.id, teamName: team.name, tileId, ...tracking, players,
    total: players.length > 0 && validPlayers.length === players.length ? validPlayers.reduce((sum,p) => sum+p.gained,0) : null,
    knownTotal: validPlayers.reduce((sum,p) => sum+p.gained,0),
    missingPlayers: players.length - validPlayers.length
  };
}

export class WiseOldMan {
  constructor({ fetch: transport = globalThis.fetch, now = Date.now } = {}) {
    this.transport = transport; this.now = now; this.cache = null; this.pending = null; this.retryAt = 0;
  }
  async get(competitionId, team, tileId) {
    if (!Number.isSafeInteger(competitionId) || competitionId <= 0) throw new TrackingError('Wise Old Man is not configured.');
    if (this.cache?.id !== competitionId || this.cache.expires <= this.now()) {
      if (this.now() < this.retryAt) throw new TrackingError('Wise Old Man is temporarily unavailable. Try again shortly.', Math.ceil((this.retryAt-this.now())/1000));
      if (!this.pending) {
        this.pending = this.load(competitionId).finally(() => { this.pending = null; });
      }
      await this.pending;
    }
    return competitionView(this.cache.data, competitionId, team, tileId, this.cache.fetchedAt, this.now());
  }
  async load(id) {
    try {
      const transport = this.transport;
      const response = await transport(`https://api.wiseoldman.net/v2/competitions/${id}?metrics=barrows_chests&metrics=mimic&metrics=prayer`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Misclickas-Spooky-Bingo/1.0' }, signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        const header = response.headers.get('Retry-After');
        const delay = /^\d+$/.test(header || '') ? Number(header) : Math.ceil((Date.parse(header)-this.now())/1000);
        throw new TrackingError('Wise Old Man could not load the competition. Existing bingo progress is unaffected.', Number.isFinite(delay) ? Math.max(60,delay) : 60);
      }
      const data = await response.json();
      // Validate before caching; a corrupt response must not look like zero gains.
      competitionView(data, id, { id: 'validation', name: '' }, 'the-crypt-keeper', null, this.now());
      this.cache = { id, data, fetchedAt: new Date(this.now()).toISOString(), expires: this.now()+60000 };
    } catch (error) {
      const failure = error instanceof TrackingError ? error : new TrackingError('Wise Old Man could not be reached. Try again shortly; screenshot submissions still work.');
      this.retryAt = this.now()+failure.retryAfter*1000;
      throw failure;
    }
  }
}
