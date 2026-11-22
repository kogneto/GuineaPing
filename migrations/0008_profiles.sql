-- A Member's Profile: facts about them that only they see. lat/lon are the ZIP code's point.
CREATE TABLE profiles (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  birth_year INTEGER,
  sex TEXT,
  zip TEXT,
  miles INTEGER,
  lat REAL,
  lon REAL,
  healthy INTEGER NOT NULL DEFAULT 0,
  conditions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
