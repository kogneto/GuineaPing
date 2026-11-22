-- An Update: a Trial a Member already has an Alert for changed in a way that matters to them.
-- update_text is a JSON list of what changed, in plain words; updated_at is when.
ALTER TABLE alerts ADD COLUMN update_text TEXT;
ALTER TABLE alerts ADD COLUMN updated_at TEXT;
CREATE INDEX alerts_member_latest ON alerts(member_id, COALESCE(updated_at, created_at));

-- When changed Trials were last looked for. One row.
CREATE TABLE update_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at TEXT NOT NULL
);
