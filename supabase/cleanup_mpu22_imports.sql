-- One-off cleanup: delete all file-import events for MPU2.2 so the course
-- can be re-imported cleanly. Leaves manual / quick-add / other-source
-- events untouched.
--
-- Preview the rows that would be affected:
--   SELECT e.id, e.title, e.source, e.date, e.source_file
--   FROM events e
--   JOIN courses c ON c.id = e.course_id
--   WHERE c.code = 'MPU2.2'
--     AND e.source IN ('ppt_import', 'pdf_import', 'docx_import');
--
-- Then run the DELETE below.

DELETE FROM events
WHERE id IN (
  SELECT e.id
  FROM events e
  JOIN courses c ON c.id = e.course_id
  WHERE c.code = 'MPU2.2'
    AND e.source IN ('ppt_import', 'pdf_import', 'docx_import')
);
