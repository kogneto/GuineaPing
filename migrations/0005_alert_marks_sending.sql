-- A Member's own sorting of an Alert: mark is 'interested' or 'not_for_me'; note is private to them.
ALTER TABLE alerts ADD COLUMN mark TEXT;
ALTER TABLE alerts ADD COLUMN note TEXT;
-- Set when another Member sent this Alert rather than a Watch finding it: the sender's email.
ALTER TABLE alerts ADD COLUMN sent_by TEXT;
