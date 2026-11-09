const express = require('express');
const { buildDromicPdf } = require('../utils/dromicPdf');
const db = require('../db');
const { compileFigures } = require('../utils/figures');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit } = require('../utils/notify');
const { fieldWrite, writeError } = require('../utils/fieldWrite');

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
router.post('/', fieldWrite(201, async (req, client) => {
  const { incident_id, field_remarks } = req.body;
  if (!incident_id) throw writeError(400, 'Select a disaster incident.');
  const { rows: [incident] } = await client.query(
    'SELECT incident_id, reporting_status, date_ended FROM DISASTER_INCIDENTS WHERE incident_id = $1 FOR UPDATE',
    [incident_id]
  );
  if (!incident) throw writeError(404, 'Incident not found');

  const { rows: [finalReport] } = await client.query(
    "SELECT report_no FROM DROMIC_REPORTS WHERE incident_id = $1 AND reporting_status = 'Finalized' LIMIT 1", [incident_id]
  );
  if (finalReport) throw writeError(400, `A final report (#${finalReport.report_no}) was already issued for this incident.`);

  const figures = {
    ...(await compileFigures(incident_id, client.query.bind(client))),
    incident_status: incident.reporting_status,
    incident_date_ended: incident.date_ended
  };
  const { rows: [report] } = await client.query(
    `INSERT INTO DROMIC_REPORTS (incident_id, generated_by, reporting_status, field_remarks, report_no, as_of, snapshot)
     VALUES ($1,$2,'Active',$3,
       (SELECT COALESCE(MAX(report_no), 0) + 1 FROM DROMIC_REPORTS WHERE incident_id = $1), NOW(),$4)
     RETURNING report_id, incident_id, generated_by, report_date, reporting_status, field_remarks, report_no, as_of`,
    [incident_id, req.user.user_id, field_remarks ? String(field_remarks).trim() : null, JSON.stringify(figures)]
  );
  return report;
}, (req, report) => emit('dromic_report_generated', report)));

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

// PATCH /api/dromic/:id/status
//   Draft      -> still being prepared
//   Active     -> issued, the incident is still going (shown as "On-Going")
//   Finalized  -> the final report, locked (shown as "Final")
router.patch('/:id/status', requireRole('ADMIN_STAFF'), fieldWrite(200, async (req, client) => {
  const { reporting_status } = req.body;
  if (!STATUSES.includes(reporting_status)) throw writeError(400, `Status must be one of: ${STATUSES.join(', ')}`);
  const { rows: [cur] } = await client.query('SELECT incident_id, reporting_status FROM DROMIC_REPORTS WHERE report_id = $1 FOR UPDATE', [req.params.id]);
  if (!cur) throw writeError(404, 'Report not found');
  if (cur.reporting_status === 'Finalized') throw writeError(400, 'A final report is locked and cannot be changed.');
  if (cur.incident_id) await client.query('SELECT incident_id FROM DISASTER_INCIDENTS WHERE incident_id = $1 FOR UPDATE', [cur.incident_id]);
  const { rows } = await client.query(
    `UPDATE DROMIC_REPORTS SET reporting_status = $1 WHERE report_id = $2
     RETURNING report_id, incident_id, generated_by, report_date, reporting_status, field_remarks, report_no, as_of`,
    [reporting_status, req.params.id]
  );
  return rows[0];
}, (req, report) => emit('dromic_report_generated', report)));

module.exports = router;
