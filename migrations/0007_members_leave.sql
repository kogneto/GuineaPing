-- Members can be invited and removed in the app. A removed Member keeps their row (and Alert
-- history) but is refused at sign-in; inviting them again clears removed_at.
ALTER TABLE members ADD COLUMN invited_by TEXT;
ALTER TABLE members ADD COLUMN removed_at TEXT;
