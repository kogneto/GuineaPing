-- More facts for a Member's Profile, shown beside a Trial's Points to check. All optional, and
-- only that Member sees them. Height and weight are kept as the Member gives them, in inches and
-- pounds; nicotine is 'yes' or 'no'; the donation is a plain day (YYYY-MM-DD).
ALTER TABLE profiles ADD COLUMN height_in REAL;
ALTER TABLE profiles ADD COLUMN weight_lb REAL;
ALTER TABLE profiles ADD COLUMN nicotine TEXT;
ALTER TABLE profiles ADD COLUMN last_donation_on TEXT;
