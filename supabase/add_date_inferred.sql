-- Adds date_inferred / date_source columns to events so we can remember
-- which events had their date computed from a week reference (vs stated
-- explicitly in the source material) and surface that in the UI.
--
-- Safe to re-run thanks to IF NOT EXISTS. Existing rows get
-- date_inferred = false / date_source = NULL.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS date_inferred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_source TEXT;
