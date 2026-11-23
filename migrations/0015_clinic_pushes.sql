-- A Member asking for a Push when a Clinic's list shows a new Opening. One row per Member and
-- Clinic; no row means no Push. Only that Member sees which Clinics they chose.
CREATE TABLE clinic_pushes (
  member_id TEXT NOT NULL REFERENCES members(id),
  clinic_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, clinic_id)
);
CREATE INDEX clinic_pushes_clinic ON clinic_pushes (clinic_id);
