-- Dedup events on (user_id, course_id, title, date) so re-importing the
-- same PPT / PDF updates the existing row instead of creating a duplicate.
--
-- NULLS NOT DISTINCT (Postgres 15+) makes null course_id or null date
-- collide too — otherwise Postgres would treat each null as a distinct
-- value and duplicates would slip through.
--
-- Safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS events_user_course_title_date_uniq
  ON events (user_id, course_id, title, date) NULLS NOT DISTINCT;
