-- Let any authenticated user read the shared XMUM semester template
-- (code='2026/04') and its academic_calendar rows, so new users can
-- clone them into their own account on first login.
--
-- Existing "users_own" policies stay; these are ADDITIVE read grants.
-- No write access is granted — users can only INSERT rows under their
-- own user_id via the existing policies.
--
-- Safe to re-run (CREATE POLICY is not idempotent, so we DROP first).

DROP POLICY IF EXISTS "read_template_semester" ON semesters;
CREATE POLICY "read_template_semester" ON semesters
  FOR SELECT TO authenticated
  USING (code = '2026/04');

DROP POLICY IF EXISTS "read_template_calendar" ON academic_calendar;
CREATE POLICY "read_template_calendar" ON academic_calendar
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM semesters s
      WHERE s.id = academic_calendar.semester_id
        AND s.code = '2026/04'
    )
  );
