-- Names follow CONTEXT.md. Timestamps are ISO-8601 UTC strings.

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE watches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  criteria TEXT NOT NULL, -- JSON Criteria
  private INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- A Follow ends rather than disappearing, so Alert history keeps its meaning.
CREATE TABLE follows (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  watch_id TEXT NOT NULL REFERENCES watches(id),
  followed_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE UNIQUE INDEX follows_active ON follows(member_id, watch_id) WHERE ended_at IS NULL;
CREATE INDEX follows_watch ON follows(watch_id) WHERE ended_at IS NULL;

-- Every Trial a Watch has ever matched. A Trial is a New trial for a Watch's followers only the
-- first time it lands here through a Check; Recent matches are seeded in without Alerts.
CREATE TABLE watch_trials (
  watch_id TEXT NOT NULL REFERENCES watches(id),
  nct_id TEXT NOT NULL,
  found_at TEXT NOT NULL,
  PRIMARY KEY (watch_id, nct_id)
);

-- One Alert per Member per Trial, ever.
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  nct_id TEXT NOT NULL,
  trial TEXT NOT NULL, -- JSON Trial, as it was when alerted
  watch_names TEXT NOT NULL, -- JSON string[]; names are kept because Watches can be renamed or deleted
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (member_id, nct_id)
);
CREATE INDEX alerts_member ON alerts(member_id, created_at);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX notes_member ON notes(member_id, created_at);

CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  since TEXT NOT NULL,
  watches_checked INTEGER NOT NULL,
  alerts_created INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX checks_ok ON checks(ok, started_at);
