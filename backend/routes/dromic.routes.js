const express = require('express');
const { buildDromicPdf } = require('../utils/dromicPdf');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
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
async function compileFigures(incidentId) {
  const { rows } = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (er.evacuee_id) er.evacuee_id, er.center_id, er.status
      FROM EVACUATION_RECORDS er
      WHERE er.incident_id = $1
      ORDER BY er.evacuee_id, er.date_evacuated DESC, er.record_id DESC
    )
    SELECT l.evacuee_id, l.center_id, l.status, e.family_id, e.age, e.gender,
           COALESCE(f.barangay, 'Unknown') AS origin,
           c.center_name, c.barangay AS center_barangay, c.status AS center_status, c.capacity
    FROM latest l
    JOIN EVACUEES e ON e.evacuee_id = l.evacuee_id
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    JOIN EVACUATION_CENTERS c ON c.center_id = l.center_id
  `, [incidentId]);

  const ids = rows.map(r => r.evacuee_id);
  const pri = ids.length
    ? (await db.query('SELECT DISTINCT evacuee_id, case_type FROM PRIORITY_CASES WHERE evacuee_id = ANY($1)', [ids])).rows
    : [];

  const famKey = r => (r.family_id != null ? `f${r.family_id}` : `e${r.evacuee_id}`);
  const uniq = arr => new Set(arr).size;
  const present = rows.filter(r => r.status === 'Present');

  const group = (list, keyFn) => {
    const m = new Map();
    list.forEach(r => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return m;
  };

  const byOrigin = [...group(rows, r => r.origin)].map(([barangay, list]) => ({
    barangay, families: uniq(list.map(famKey)), persons: list.length
  })).sort((a, b) => a.barangay.localeCompare(b.barangay, undefined, { numeric: true }));

  const centers = [...group(rows, r => r.center_id)].map(([center_id, list]) => {
    const now = list.filter(r => r.status === 'Present');
    return {
      center_id, center_name: list[0].center_name, barangay: list[0].center_barangay,
      status: list[0].center_status, capacity: list[0].capacity,
      families_cum: uniq(list.map(famKey)), families_now: uniq(now.map(famKey)),
      persons_cum: list.length, persons_now: now.length,
      male_now: now.filter(r => r.gender === 'Male').length,
      female_now: now.filter(r => r.gender === 'Female').length
    };
  }).sort((a, b) => a.center_name.localeCompare(b.center_name));

  const ageBand = a => (a == null ? null : a <= 4 ? '0-4' : a <= 17 ? '5-17' : a <= 59 ? '18-59' : '60+');
  const ages = { '0-4': 0, '5-17': 0, '18-59': 0, '60+': 0 };
  present.forEach(r => { const b = ageBand(r.age); if (b) ages[b]++; });

  const presentIds = new Set(present.map(r => r.evacuee_id));
  const vulnerable = {};
  pri.filter(p => presentIds.has(p.evacuee_id)).forEach(p => { vulnerable[p.case_type] = (vulnerable[p.case_type] || 0) + 1; });

  return {
    totals: {
      families_cum: uniq(rows.map(famKey)), persons_cum: rows.length,
      families_now: uniq(present.map(famKey)), persons_now: present.length,
      centers_cum: uniq(rows.map(r => r.center_id)), centers_now: uniq(present.map(r => r.center_id)),
      barangays_affected: byOrigin.filter(b => b.barangay !== 'Unknown').length
    },
    byOrigin, centers,
    profile: {
      male: present.filter(r => r.gender === 'Male').length,
      female: present.filter(r => r.gender === 'Female').length,
      ages,
      vulnerable: Object.entries(vulnerable).map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n)
    }
  };
}

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
           u.first_name AS author_first, u.last_name AS author_last
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
router.patch('/:id/status', async (req, res) => {
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