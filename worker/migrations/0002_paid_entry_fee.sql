ALTER TABLE signups ADD COLUMN paid_entry_fee INTEGER NOT NULL DEFAULT 0
  CHECK (paid_entry_fee IN (0, 1));
