-- Openings: entries read from a Clinic's own list of studies, in the Clinic's own words.
-- id is the source and the entry's key within it. gone_at is set once a read no longer finds it.
CREATE TABLE clinic_openings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  clinic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pay TEXT,
  when_text TEXT,
  stay TEXT,
  who TEXT,
  code TEXT,
  url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  gone_at TEXT
);
CREATE INDEX clinic_openings_source ON clinic_openings (source, gone_at);

-- One row per source that is read: when it was last tried, last read, and whether its site said no.
CREATE TABLE clinic_sources (
  source TEXT PRIMARY KEY,
  attempted_at TEXT,
  read_at TEXT,
  refused_at TEXT,
  status TEXT
);
