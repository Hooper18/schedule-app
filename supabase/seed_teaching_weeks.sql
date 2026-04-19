-- Seed Week 1 … Week 14 into academic_calendar for the current semester.
-- Each week runs Sunday → Saturday anchored on semesters.week1_start.
--
-- Idempotent: deletes existing type='teaching' rows for the semester
-- before re-inserting, so you can re-run after dates change.

DO $$
DECLARE
  semester_code TEXT := '2026/04';   -- <-- change if your semester code differs
  sem_id UUID;
  w1 DATE;
BEGIN
  SELECT id, week1_start INTO sem_id, w1
  FROM semesters
  WHERE code = semester_code
  LIMIT 1;

  IF sem_id IS NULL THEN
    RAISE EXCEPTION 'semesters row with code=% not found. Edit the semester_code variable above.', semester_code;
  END IF;

  IF w1 IS NULL THEN
    RAISE EXCEPTION 'semesters.week1_start is null for code=%. Set it first (see seed_calendar.sql).', semester_code;
  END IF;

  DELETE FROM academic_calendar
  WHERE semester_id = sem_id AND type = 'teaching';

  INSERT INTO academic_calendar (semester_id, title, date, end_date, type)
  SELECT
    sem_id,
    'Week ' || i,
    w1 + (i - 1) * 7,
    w1 + (i - 1) * 7 + 6,
    'teaching'
  FROM generate_series(1, 14) AS i;

  RAISE NOTICE 'Seeded Week 1..14 for semester % (week1_start=%)', semester_code, w1;
END $$;
