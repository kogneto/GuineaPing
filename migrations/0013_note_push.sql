-- A note in a Member's Alert list can also be announced on their Devices. Only a note written
-- with announce = 1 is: today that is the one saying a waiting period has ended. Every note
-- written before this, and every other kind of note, stays in the Alert list only.
-- pushed_at is set once a Device got the Push, or the Member has no Device to send it to.
ALTER TABLE notes ADD COLUMN announce INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN pushed_at TEXT;
