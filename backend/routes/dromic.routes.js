const express = require('express');
const { buildDromicPdf, buildDromicXlsx } = require('../utils/dromicPdf');
const db = require('../db');
const { compileFigures } = require('../utils/figures');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

const STATUSES = ['Draft', 'Active', 'Finalized'];

// GET /api/dromic
router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT r.report_id, r.incident_id, r.generated_by, r.report_date, r.reporting_status,
           r.field_remarks, r.report_no, r.as_of,
           i.disaster_name, i.disaster_type, i.brgy,
           u.first_name AS author_first, u.last_name AS author_last
    FROM DROMIC_REPORTS r
    LEFT JOIN DISASTER_INCIDENTS i ON i.incident_id = r.incident_id
    LEFT JOIN USERS u ON u.user_id = r.generated_by
    ORDER BY r.report_date DESC, r.report_id DESC
  `);
  res.json(rows);
});

// The figures a DROMIC report needs, the way DSWD lays them out:
//   Table 1  affected families / persons per barangay of origin
//   Table 2  displaced inside evacuation centers, cumulative (Cum) and current (Now)
//   Table 3  profile of those currently inside (sex, age group, vulnerable sectors)
// "Cum" = everyone ever registered under the incident, "Now" = still Present.
// POST /api/dromic - makes the next numbered report for an incident,
// freezing the figures as of right now.
router.post('/', async (req, res) => {
  try {
    const { incident_id, field_remarks } = req.body;
    if (!incident_id) return res.status(400).json({ error: 'incident_id is required' });

    const { rows: [inc] } = await db.query('SELECT incident_id, reporting_status, date_ended FROM DISASTER_INCIDENTS WHERE incident_id = $1', [incident_id]);
    if (!inc) return res.status(404).json({ error: 'Incident not found' });

    const { rows: [fin] } = await db.query(
      `SELECT report_no FROM DROMIC_REPORTS WHERE incident_id = $1 AND reporting_status = 'Finalized' LIMIT 1`, [incident_id]);
    if (fin) return res.status(400).json({ error: `A final report (#${fin.report_no}) was already issued for this incident, so no new reports can be added.` });

    const figures = { ...(await compileFigures(incident_id)), incident_status: inc.reporting_status, incident_date_ended: inc.date_ended };
    const { rows: [report] } = await db.query(
      `INSERT INTO DROMIC_REPORTS (incident_id, generated_by, reporting_status, field_remarks, report_no, as_of, snapshot)
       VALUES ($1, $2, 'Active',  $3,
               (SELECT COALESCE(MAX(report_no), 0) + 1 FROM DROMIC_REPORTS WHERE incident_id = $1),
               NOW(), $4)
       RETURNING report_id, incident_id, generated_by, report_date, reporting_status, field_remarks, report_no, as_of`,
      [incident_id, req.user.user_id, field_remarks ? String(field_remarks).trim() : null, JSON.stringify(figures)]
    );
    emit('dromic_report_generated', report);
    res.status(201).json(report);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not generate the report' });
  }
});

async function compileSummary(reportId) {
  const { rows: [report] } = await db.query(`
    SELECT r.*, i.disaster_name, i.disaster_type, i.brgy, i.severity, i.date_started, i.date_ended,
           i.reporting_status AS incident_status, i.field_remarks AS incident_remarks,
           u.first_name AS author_first, u.last_name AS author_last, u.phone AS author_phone
    FROM DROMIC_REPORTS r
    LEFT JOIN DISASTER_INCIDENTS i ON i.incident_id = r.incident_id
    LEFT JOIN USERS u ON u.user_id = r.generated_by
    WHERE r.report_id = $1
  `, [reportId]);
  if (!report) return null;
  // Older reports (made before snapshots existed) are compiled live.
  const figures = report.snapshot || (report.incident_id ? await compileFigures(report.incident_id) : null);
  const { snapshot, ...rest } = report;
  if (figures?.incident_status) { rest.incident_status = figures.incident_status; rest.date_ended = figures.incident_date_ended || null; }
  return { report: rest, ...figures };
}

// GET /api/dromic/:id/summary
router.get('/:id/summary', async (req, res) => {
  const data = await compileSummary(req.params.id);
  if (!data) return res.status(404).json({ error: 'Report not found' });
  res.json(data);
});

// GET /api/dromic/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  const data = await compileSummary(req.params.id);
  if (!data) return res.status(404).json({ error: 'Report not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="DROMIC-Report-${data.report.report_no || data.report.report_id}-${data.report.report_id}.pdf"`);
  try {
    buildDromicPdf(data, res);
  } catch (e) {
    console.error('DROMIC PDF failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not build PDF' });
    else res.end();
  }
});

// GET /api/dromic/:id/xlsx - the report filled into the official DSWD DROMIC Excel template
router.get('/:id/xlsx', async (req, res) => {
  try {
    const data = await compileSummary(req.params.id);
    if (!data) return res.status(404).json({ error: 'Report not found' });
    // Reports saved before Excel export existed have no per-center rows in their snapshot,
    // so fill those in from the current records.
    if (!data.ecRows && data.report.incident_id) Object.assign(data, await compileFigures(data.report.incident_id));
    const { buffer } = await buildDromicXlsx(data);
    const name = `DROMIC-Report-${data.report.report_no || data.report.report_id}-${String(data.report.disaster_name || 'incident').replace(/[^\w-]+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (e) {
    console.error('DROMIC Excel failed:', e);
    res.status(500).json({ error: 'Could not build the Excel report' });
  }
});

// PATCH /api/dromic/:id/status
//   Draft      -> still being prepared
//   Active     -> issued, the incident is still going (shown as "On-Going")
//   Finalized  -> the final report, locked (shown as "Final")
router.patch('/:id/status', requireRole('ADMIN_STAFF'), async (req, res) => {
  const { reporting_status } = req.body;
  if (!STATUSES.includes(reporting_status)) return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
  const { rows: [cur] } = await db.query('SELECT reporting_status FROM DROMIC_REPORTS WHERE report_id = $1', [req.params.id]);
  if (!cur) return res.status(404).json({ error: 'Report not found' });
  if (cur.reporting_status === 'Finalized') return res.status(400).json({ error: 'A final report is locked and cannot be changed.' });
  const { rows } = await db.query(
    `UPDATE DROMIC_REPORTS SET reporting_status = $1 WHERE report_id = $2
     RETURNING report_id, incident_id, generated_by, report_date, reporting_status, field_remarks, report_no, as_of`,
    [reporting_status, req.params.id]
  );
  emit('dromic_report_generated', rows[0]);
  res.json(rows[0]);
});

module.exports = router;