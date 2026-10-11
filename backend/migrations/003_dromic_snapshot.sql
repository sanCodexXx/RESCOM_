-- DROMIC reports become numbered "as of" snapshots, like the DSWD ones:
--   Report #1, #2, #3 ... for the same incident, each frozen at the moment it was made.
ALTER TABLE DROMIC_REPORTS ADD COLUMN IF NOT EXISTS report_no INTEGER;
ALTER TABLE DROMIC_REPORTS ADD COLUMN IF NOT EXISTS as_of     TIMESTAMP;
ALTER TABLE DROMIC_REPORTS ADD COLUMN IF NOT EXISTS snapshot  JSONB;

-- Number the reports that already exist (oldest first, per incident).
UPDATE DROMIC_REPORTS r
   SET report_no = x.n, as_of = COALESCE(r.as_of, r.report_date)
  FROM (SELECT report_id, ROW_NUMBER() OVER (PARTITION BY incident_id ORDER BY report_date, report_id) AS n
          FROM DROMIC_REPORTS) x
 WHERE r.report_id = x.report_id AND r.report_no IS NULL;