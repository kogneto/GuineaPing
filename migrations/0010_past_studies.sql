-- Past studies: what a Member writes down about a study they took part in, to work out when
-- their waiting period ends. Only that Member sees it. Dates are plain days (YYYY-MM-DD).
-- free_on is the later of the two dates plus wait_days; told_at is set once the Member has been
-- told, in their Alert list, that the waiting period is over.
CREATE TABLE past_studies (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  label TEXT NOT NULL DEFAULT '',
  ended_on TEXT NOT NULL,
  last_dose_on TEXT,
  wait_days INTEGER NOT NULL,
  free_on TEXT NOT NULL,
  told_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX past_studies_member ON past_studies (member_id, free_on);
