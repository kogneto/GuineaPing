-- Each Watch keeps its own place, so one that can't be checked doesn't hold the others back.
-- checked_at: when its last successful check started. failing_since: when its current run of
-- failures began (NULL while it is healthy). check_error: why the last one failed.
ALTER TABLE watches ADD COLUMN checked_at TEXT;
ALTER TABLE watches ADD COLUMN failing_since TEXT;
ALTER TABLE watches ADD COLUMN check_error TEXT;
UPDATE watches SET checked_at = (SELECT max(started_at) FROM checks WHERE ok = 1);

-- Pushes are retried until one Device gets them. via_private keeps the lock-screen wording generic
-- on a retry. Alerts from before this migration count as pushed.
ALTER TABLE alerts ADD COLUMN via_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN pushed_at TEXT;
UPDATE alerts SET pushed_at = created_at;
CREATE INDEX alerts_unpushed ON alerts(created_at) WHERE pushed_at IS NULL;
