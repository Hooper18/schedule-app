-- Seed academic_calendar + patch semesters dates for XMUM April Semester 2026.
--
-- Idempotent: wipes existing academic_calendar rows for the target semester
-- before re-inserting, so you can safely re-run after edits.
--
-- Prereq: a semesters row must already exist. The script locates it by the
-- semester_code variable below — adjust if your row's `code` column differs.
-- Run in Supabase SQL Editor (or `supabase db execute -f`).

DO $$
DECLARE
  semester_code TEXT := '2026/04';   -- <-- change if your semester code differs
  sem_id UUID;
BEGIN
  SELECT id INTO sem_id FROM semesters WHERE code = semester_code LIMIT 1;
  IF sem_id IS NULL THEN
    RAISE EXCEPTION 'semesters row with code=% not found. Create the semester first (Dashboard → Table Editor → semesters) or edit the semester_code variable above.', semester_code;
  END IF;

  -- Patch the semester itself so the UI's Week N math and calendar
  -- shading reflect the real academic calendar.
  UPDATE semesters
  SET week1_start    = DATE '2026-04-05',
      end_date       = DATE '2026-07-11',
      revision_start = DATE '2026-07-13',
      exam_start     = DATE '2026-07-20',
      exam_end       = DATE '2026-07-31'
  WHERE id = sem_id;

  -- Clear previous rows for this semester so re-runs don't duplicate.
  DELETE FROM academic_calendar WHERE semester_id = sem_id;

  INSERT INTO academic_calendar (semester_id, title, date, end_date, type) VALUES
    -- Registration + orientation
    (sem_id, 'Registration Day 1', DATE '2026-04-03', NULL,               'registration'),
    (sem_id, 'Registration Day 2', DATE '2026-04-04', NULL,               'registration'),
    (sem_id, 'Orientation Day',    DATE '2026-04-05', NULL,               'orientation'),

    -- Teaching term (Week 1 → Week 14)
    (sem_id, 'Week 1',              DATE '2026-04-05', DATE '2026-04-11', 'teaching'),
    (sem_id, 'Week 14',             DATE '2026-07-05', DATE '2026-07-11', 'teaching'),

    -- Revision + examination
    (sem_id, 'Revision Week',       DATE '2026-07-13', DATE '2026-07-19', 'revision'),
    (sem_id, 'Examination Week',    DATE '2026-07-20', DATE '2026-07-31', 'exam'),

    -- Malaysian public holidays within the semester
    (sem_id, 'Labour Day',                  DATE '2026-05-01', NULL, 'holiday'),
    (sem_id, 'Hari Raya Haji',              DATE '2026-05-27', NULL, 'holiday'),
    (sem_id, 'Wesak Day',                   DATE '2026-05-31', NULL, 'holiday'),
    (sem_id, 'Agong''s Birthday',           DATE '2026-06-01', NULL, 'holiday'),
    (sem_id, 'Awal Muharram',               DATE '2026-06-17', NULL, 'holiday');

  RAISE NOTICE 'Seeded academic_calendar for semester % (id=%)', semester_code, sem_id;
END $$;
