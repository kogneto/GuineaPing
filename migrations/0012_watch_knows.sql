-- What a Watch knew about when it was made or last changed, which decides how a Check looks for it.
-- 'all':    every Trial it matched was recorded, so a Check can look at Trials changed since the
--           last Check and alert on any it has not seen, however long ago they were first posted.
-- 'recent': it matches too many Trials to record them all, so a Check looks only at Trials first
--           posted since the last Check, as every Watch did before.
-- NULL:     made before this was kept; the next Check finds out which it is.
ALTER TABLE watches ADD COLUMN knows TEXT;
