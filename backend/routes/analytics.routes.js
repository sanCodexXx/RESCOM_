// Reports & Analytics: the dashboard numbers and the period situational reports.
// Everything is read from the live tables.
//   Barangay filter: incidents by the barangay they were logged in,
//                    evacuees by their barangay of origin (their family's barangay).
//   "Evacuee trend" always covers the last 14 days, ending today.
const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { compileFigures } = require('../utils/figures');
const { buildDromicPdf, buildDromicXlsx } = require('../utils/dromicPdf');

const router = express.Router();
router.use(verifyToken);

const DAY = 86400000;
const MAX_DAYS = 366 * 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_TITLE = {
  monthly: 'Monthly Situational Report',
  quarterly: 'Quarterly Situational Report',
  custom: 'Situational Report'
};

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const toMs = s => Date.parse(s + 'T00:00:00Z');
const toIso = ms => new Date(ms).toISOString().slice(0, 10);
const fmtLong = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

function readPeriod(q) {
  const from = String(q.from || '');
  const to = String(q.to || '');
  if (!isDate(from) || !isDate(to) || from > to) {
    return { error: 'Choose a valid From and To date, with From on or before To.' };
  }
  if ((toMs(to) - toMs(from)) / DAY + 1 > MAX_DAYS) {
    return { error: 'The period can be at most five years long.' };
  }
  const brgy = q.brgy ? String(q.brgy).trim().slice(0, 100) : '';
  return { from, to, brgy: brgy || null };
}

// The period right before, with the same number of days (for "vs last period").
function previousPeriod(from, to) {
  const days = Math.round((toMs(to) - toMs(from)) / DAY) + 1;
  return { prevFrom: toIso(toMs(from) - days * DAY), prevTo: toIso(toMs(from) - DAY) };
}

// Every month from one date to another, as 'YYYY-MM' keys (months with no incidents included).
function monthKeys(from, to) {
  const keys = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return keys;
}

// ---------- dashboard queries ----------

async function incidentTotals(from, to, brgy) {
  const { rows: [r] } = await db.query(`
    SELECT COUNT(*)::int AS total,
           CAST(COUNT(*) FILTER (WHERE i.reporting_status = 'Resolved') AS INTEGER) AS resolved
    FROM DISASTER_INCIDENTS i
    WHERE i.date_started >= $1::date AND i.date_started < $2::date + 1
      AND ($3::text IS NULL OR i.brgy = $3)`, [from, to, brgy]);
  return r;
}

async function evacueesServed(from, to, brgy) {
  const { rows: [r] } = await db.query(`
    SELECT COUNT(DISTINCT er.evacuee_id)::int AS n
    FROM EVACUATION_RECORDS er
    JOIN EVACUEES e ON e.evacuee_id = er.evacuee_id
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    WHERE er.date_evacuated >= $1::date AND er.date_evacuated < $2::date + 1
      AND ($3::text IS NULL OR COALESCE(f.barangay, 'Unknown') = $3)`, [from, to, brgy]);
  return r.n;
}

// Minutes from an incident being logged to the first evacuee registered for it.
async function avgResponseMinutes(from, to, brgy) {
  const { rows: [r] } = await db.query(`
    SELECT ROUND((AVG(EXTRACT(EPOCH FROM (f.first_at - i.date_started)) / 60))::numeric, 1) AS minutes,
           COUNT(*)::int AS n
    FROM DISASTER_INCIDENTS i
    JOIN LATERAL (
      SELECT MIN(er.date_evacuated) AS first_at
      FROM EVACUATION_RECORDS er
      WHERE er.incident_id = i.incident_id
    ) f ON f.first_at IS NOT NULL
    WHERE i.date_started >= $1::date AND i.date_started < $2::date + 1
      AND ($3::text IS NULL OR i.brgy = $3)
      AND f.first_at >= i.date_started`, [from, to, brgy]);
  return r.n ? Number(r.minutes) : null;
}

async function incidentsByMonth(from, to, brgy) {
  const { rows } = await db.query(`
    SELECT to_char(date_trunc('month', i.date_started), 'YYYY-MM') AS month, COUNT(*)::int AS n
    FROM DISASTER_INCIDENTS i
    WHERE i.date_started >= $1::date AND i.date_started < $2::date + 1
      AND ($3::text IS NULL OR i.brgy = $3)
    GROUP BY 1
    ORDER BY 1`, [from, to, brgy]);
  const counts = Object.fromEntries(rows.map(r => [r.month, r.n]));
  const multiYear = from.slice(0, 4) !== to.slice(0, 4);
  return monthKeys(from, to).map(key => {
    const m = Number(key.slice(5, 7));
    return {
      month: key,
      label: MONTHS[m - 1] + (multiYear ? ` ${key.slice(0, 4)}` : ''),
      incidents: counts[key] || 0
    };
  });
}

async function incidentTypes(from, to, brgy) {
  const { rows } = await db.query(`
    SELECT i.disaster_type AS type, COUNT(*)::int AS n
    FROM DISASTER_INCIDENTS i
    WHERE i.date_started >= $1::date AND i.date_started < $2::date + 1
      AND ($3::text IS NULL OR i.brgy = $3)
    GROUP BY 1
    ORDER BY n DESC, 1`, [from, to, brgy]);
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return rows.map(r => ({
    type: r.type,
    count: r.n,
    pct: total ? Math.round((r.n / total) * 1000) / 10 : 0
  }));
}

async function evacueeTrend14(brgy) {
  const { rows } = await db.query(`
    SELECT to_char(d.dy, 'YYYY-MM-DD') AS day, COUNT(r.record_id)::int AS n
    FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS d(dy)
    LEFT JOIN EVACUATION_RECORDS r
      ON r.date_evacuated >= d.dy AND r.date_evacuated < d.dy + interval '1 day'
     AND ($1::text IS NULL OR r.evacuee_id IN (
           SELECT e.evacuee_id
           FROM EVACUEES e
           LEFT JOIN FAMILIES f ON f.family_id = e.family_id
           WHERE COALESCE(f.barangay, 'Unknown') = $1))
    GROUP BY d.dy
    ORDER BY d.dy`, [brgy]);
  return rows.map(r => ({
    date: r.day,
    label: fmtLong(r.day).replace(/ \d{4}$/, ''),
    evacuees: r.n
  }));
}

async function topBarangays(from, to, brgy) {
  const { rows } = await db.query(`
    SELECT COALESCE(f.barangay, 'Unknown') AS barangay,
           COUNT(DISTINCT er.evacuee_id)::int AS persons,
           COUNT(DISTINCT COALESCE(e.family_id::text, 'e' || e.evacuee_id::text))::int AS families
    FROM EVACUATION_RECORDS er
    JOIN EVACUEES e ON e.evacuee_id = er.evacuee_id
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    WHERE er.date_evacuated >= $1::date AND er.date_evacuated < $2::date + 1
      AND ($3::text IS NULL OR COALESCE(f.barangay, 'Unknown') = $3)
    GROUP BY 1
    ORDER BY persons DESC, 1
    LIMIT 5`, [from, to, brgy]);
  return rows;
}

// GET /api/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&brgy=
router.get('/overview', async (req, res) => {
  const p = readPeriod(req.query);
  if (p.error) return res.status(400).json({ error: p.error });
  const { from, to, brgy } = p;
  const { prevFrom, prevTo } = previousPeriod(from, to);
  try {
    const [cur, prev, evCur, evPrev, resp, respPrev, monthly, types, trend, top] = await Promise.all([
      incidentTotals(from, to, brgy),
      incidentTotals(prevFrom, prevTo, brgy),
      evacueesServed(from, to, brgy),
      evacueesServed(prevFrom, prevTo, brgy),
      avgResponseMinutes(from, to, brgy),
      avgResponseMinutes(prevFrom, prevTo, brgy),
      incidentsByMonth(from, to, brgy),
      incidentTypes(from, to, brgy),
      evacueeTrend14(brgy),
      topBarangays(from, to, brgy)
    ]);
    res.json({
      period: { from, to, prevFrom, prevTo, brgy },
      kpis: {
        incidents: { value: cur.total, prev: prev.total },
        evacuees: { value: evCur, prev: evPrev },
        responseMinutes: { value: resp, prev: respPrev },
        resolution: { resolved: cur.resolved, total: cur.total }
      },
      monthly,
      byType: types,
      trend14: trend,
      topBarangays: top
    });
  } catch (e) {
    console.error('analytics overview failed:', e);
    res.status(500).json({ error: 'Could not load analytics' });
  }
});

// ---------- period report (PDF / Excel / CSV) ----------

async function incidentsInPeriod(from, to, brgy) {
  const { rows } = await db.query(`
    SELECT i.disaster_name, i.disaster_type, i.brgy, i.severity, i.reporting_status, i.date_started, i.date_ended
    FROM DISASTER_INCIDENTS i
    WHERE i.date_started >= $1::date AND i.date_started < $2::date + 1
      AND ($3::text IS NULL OR i.brgy = $3)
    ORDER BY i.date_started`, [from, to, brgy]);
  return rows;
}

// Same shape as a per-incident DROMIC report, so the existing PDF and Excel builders fill in.
async function periodData({ from, to, brgy }, type, userId) {
  const [figures, incidents, userRes] = await Promise.all([
    compileFigures({ from, to, brgy }),
    incidentsInPeriod(from, to, brgy),
    db.query('SELECT first_name, last_name, phone FROM USERS WHERE user_id = $1', [userId])
  ]);
  const user = userRes.rows[0] || {};

  const typeCounts = {};
  incidents.forEach(i => { typeCounts[i.disaster_type] = (typeCounts[i.disaster_type] || 0) + 1; });
  const typeText = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`)
    .join(', ');

  const title = TYPE_TITLE[type] || TYPE_TITLE.custom;
  const now = new Date();
  return {
    report: {
      report_id: null,
      report_no: null,
      disaster_name: title,
      disaster_type: null,
      date_started: from,
      reporting_status: 'Active',
      incident_status: null,
      as_of: now,
      report_date: now,
      field_remarks: null,
      brgy,
      author_first: user.first_name,
      author_last: user.last_name,
      author_phone: user.phone,
      period: {
        label: `${fmtLong(from)} to ${fmtLong(to)}`,
        from,
        to,
        incidents: incidents.length,
        resolved: incidents.filter(i => i.reporting_status === 'Resolved').length,
        types: typeText
      }
    },
    totals: figures.totals,
    byOrigin: figures.byOrigin,
    centers: figures.centers,
    profile: figures.profile,
    ecRows: figures.ecRows,
    incidents
  };
}

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const shortDate = d => (d ? new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

function toCsv({ report, totals, byOrigin, centers, incidents }) {
  const rows = [];
  const line = (...cells) => rows.push(cells.map(csvCell).join(','));
  const p = report.period;

  line('RESCOM Situational Report');
  line('Report', report.disaster_name);
  line('Period', p.label);
  line('Barangay of origin', report.brgy || 'All barangays');
  line('Generated', shortDate(new Date()));
  rows.push('');
  line('SUMMARY');
  line('Incidents logged', p.incidents);
  line('Incidents resolved', p.resolved);
  line('Families registered', totals.families_cum);
  line('Persons registered', totals.persons_cum);
  line('Persons currently in centers', totals.persons_now);
  line('Evacuation centers used', totals.centers_cum);
  rows.push('');
  line('INCIDENTS');
  line('Incident', 'Type', 'Barangay', 'Severity', 'Status', 'Logged', 'Ended');
  incidents.forEach(i => line(i.disaster_name, i.disaster_type, i.brgy, i.severity, i.reporting_status, shortDate(i.date_started), shortDate(i.date_ended)));
  rows.push('');
  line('AFFECTED BY BARANGAY OF ORIGIN');
  line('Barangay', 'Families', 'Persons');
  byOrigin.forEach(b => line(b.barangay, b.families, b.persons));
  rows.push('');
  line('EVACUATION CENTERS');
  line('Center', 'Barangay', 'Capacity', 'Families registered', 'Persons registered', 'Families now', 'Persons now', 'Male now', 'Female now');
  centers.forEach(c => line(c.center_name, c.barangay, c.capacity, c.families_cum, c.persons_cum, c.families_now, c.persons_now, c.male_now, c.female_now));
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

// GET /api/analytics/export?type=monthly|quarterly|custom&from=&to=&brgy=&format=pdf|xlsx|csv
router.get('/export', async (req, res) => {
  const p = readPeriod(req.query);
  if (p.error) return res.status(400).json({ error: p.error });
  const type = TYPE_TITLE[req.query.type] ? req.query.type : 'custom';
  const format = ['pdf', 'xlsx', 'csv'].includes(req.query.format) ? req.query.format : null;
  if (!format) return res.status(400).json({ error: 'Format must be pdf, xlsx or csv.' });

  const base = `Situational-Report-${p.from}-to-${p.to}${p.brgy ? '-' + p.brgy.replace(/[^\w-]+/g, '_') : ''}`;
  try {
    const data = await periodData(p, type, req.user.user_id);
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      return buildDromicPdf(data, res);
    }
    if (format === 'xlsx') {
      const { buffer } = await buildDromicXlsx(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send(toCsv(data));
  } catch (e) {
    console.error('analytics export failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not build the report' });
    else res.end();
  }
});

module.exports = router;