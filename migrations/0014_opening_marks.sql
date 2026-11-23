-- A Member setting an Opening aside. Only that Member sees it.
-- kind 'round': "Not this time". key is the Opening's id; seen is what the entry said when it was
--   marked (its code, dates and first-seen day). The mark stops counting once any of those differ,
--   so the same study listed again shows again.
-- kind 'study': "Not for me". key is the source, a colon, and the Clinic's code for the study
--   as a whole. It hides every entry of that study at that source, now and later.
CREATE TABLE opening_marks (
  member_id TEXT NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  seen TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, kind, key)
);
