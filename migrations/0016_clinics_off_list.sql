-- A Member taking a Clinic off their own Clinics list, for instance one too far away to travel to.
-- One row per Member and Clinic; no row means the Clinic is on their list. Only that Member sees it,
-- and they can put it back.
CREATE TABLE clinics_off_list (
  member_id TEXT NOT NULL REFERENCES members(id),
  clinic_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, clinic_id)
);
