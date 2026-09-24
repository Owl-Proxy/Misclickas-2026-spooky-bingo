CREATE TABLE IF NOT EXISTS draft_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','paused','complete')),
  mode TEXT NOT NULL DEFAULT 'snake' CHECK (mode IN ('snake','alternating')),
  first_team TEXT NOT NULL DEFAULT 'vampire' CHECK (first_team IN ('vampire','werewolf')),
  vampire_captain TEXT NOT NULL DEFAULT '',
  werewolf_captain TEXT NOT NULL DEFAULT '',
  pick_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  operation_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
INSERT OR IGNORE INTO draft_state (id) VALUES (1);
CREATE TABLE IF NOT EXISTS draft_pool (
  signup_id TEXT PRIMARY KEY REFERENCES signups(id)
);
CREATE TABLE IF NOT EXISTS draft_picks (
  number INTEGER PRIMARY KEY,
  signup_id TEXT NOT NULL UNIQUE REFERENCES signups(id),
  team_id TEXT NOT NULL CHECK (team_id IN ('vampire','werewolf')),
  picked_by TEXT NOT NULL,
  picked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS draft_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
