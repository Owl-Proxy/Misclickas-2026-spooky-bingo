CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  player_key TEXT NOT NULL UNIQUE,
  discord TEXT NOT NULL,
  team_id TEXT NOT NULL DEFAULT '' CHECK (team_id IN ('', 'vampire', 'werewolf')),
  role_assigned INTEGER NOT NULL DEFAULT 0 CHECK (role_assigned IN (0, 1)),
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TEXT
);
