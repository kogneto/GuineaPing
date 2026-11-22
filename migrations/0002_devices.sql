-- A Device: a browser or phone a Member has allowed to receive Pushes (CONTEXT.md).
-- The endpoint identifies the browser; if another Member signs in on the same browser and
-- turns notifications on, the Device moves to them.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sent_at TEXT
);
CREATE INDEX devices_member ON devices(member_id);
