-- Preserve every existing signup and the participant pool of any draft already started.
ALTER TABLE signups ADD COLUMN include_in_draft INTEGER NOT NULL DEFAULT 1 CHECK (include_in_draft IN (0, 1));
