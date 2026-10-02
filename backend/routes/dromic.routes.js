const express = require('express');
const { buildDromicPdf } = require('../utils/dromicPdf');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { emit } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT r.*, i.disaster_name, i.disaster_type, i.brgy,
           u.first_name AS author_first, u.last_name AS author_last
    FROM DROMIC_REPORTS r
    LEFT JOIN DISASTER_INCIDENTS i ON i.incident_id = r.incident_id
    LEFT JOIN USERS u ON u.user_id = r.generated_by
    ORDER BY r.report_date DESC
  `);
  res.json(rows);
});

// POST /api/dromic — compiles current stats for an incident into a report
router.post('/', async (req, res) => {
  const { incident_id, field_remarks } = req.body;
  if (!incident_id) return res.status(400).json({ error: 'incident_id is required' });

  const { rows: [report] } = await db.query(
    `INSERT INTO DROMIC_REPORTS (incident_id, generated_by, reporting_status, field_remarks)
     VALUES ($1,$2,'Active',$3) RETURNING *`,
    [incident_id, req.user.user_id, field_remarks || null]
  );
  emit('dromic_report_generated', report);
  res.status(201).json(report);
});

async function compileSummary(reportId) {
  const { rows: [report] } = await db.query(`
    SELECT r.*, i.disaster_name, i.disaster_type, i.brgy, i.severity, i.date_started,
           u.first_name AS author_first, u.last_name AS author_last
    FROM DROMIC_REPORTS r
    LEFT JOIN DISASTER_INCIDENTS i ON i.incident_id = r.incident_id
    LEFT JOIN USERS u ON u.user_id = r.generated_by
    WHERE r.report_id = $1
  `, [reportId]);
  if (!report) return null;

  const centers = await db.query('SELECT * FROM EVACUATION_CENTERS ORDER BY center_name');
  const totals = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM EVACUATION_RECORDS WHERE incident_id = $1) AS total_evacuated,
      (SELECT COUNT(*)::int FROM EVACUATION_RECORDS WHERE incident_id = $1 AND status = 'Present') AS currently_present,
      (SELECT COUNT(DISTINCT e.evacuee_id)::int FROM EVACUATION_RECORDS er JOIN EVACUEES e ON e.evacuee_id = er.evacuee_id
         JOIN PRIORITY_CASES p ON p.evacuee_id = e.evacuee_id WHERE er.incident_id = $1) AS priority_count
  `, [report.incident_id]);
  const priorityBreakdown = await db.query(`
    SELECT p.case_type, COUNT(DISTINCT p.evacuee_id)::int AS n
    FROM PRIORITY_CASES p
    JOIN EVACUATION_RECORDS er ON er.evacuee_id = p.evacuee_id
    WHERE er.incident_id = $1
    GROUP BY p.case_type ORDER BY n DESC
  `, [report.incident_id]);

  return { report, centers: centers.rows, totals: totals.rows[0], priorityBreakdown: priorityBreakdown.rows };
}

// GET /api/dromic/:id/summary — the compiled figures the report references
router.get('/:id/summary', async (req, res) => {
  const data = await compileSummary(req.params.id);
  if (!data) return res.status(404).json({ error: 'Report not found' });
  res.json(data);
});

// GET /api/dromic/:id/pdf — A4 printable/downloadable PDF of the report
// (layout + logos live in utils/dromicPdf.js)
router.get('/:id/pdf', async (req, res) => {
  const data = await compileSummary(req.params.id);
  if (!data) return res.status(404).json({ error: 'Report not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="DROMIC-Report-${data.report.report_id}.pdf"`);
  try {
    buildDromicPdf(data, res);
  } catch (e) {
    console.error('DROMIC PDF failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not build PDF' });
    else res.end();
  }
});

router.patch('/:id/status', async (req, res) => {
  const { reporting_status } = req.body;
  const { rows } = await db.query(
    `UPDATE DROMIC_REPORTS SET reporting_status = $1 WHERE report_id = $2 RETURNING *`,
    [reporting_status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
  emit('dromic_report_generated', rows[0]);
  res.json(rows[0]);
});

module.exports = router;
