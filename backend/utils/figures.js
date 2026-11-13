// Figures for a DROMIC report. The same numbers feed the per-incident reports and
// the period (monthly / quarterly) situational reports.
//   compileFigures(incidentId)                 -> one incident
//   compileFigures({ from, to, brgy })         -> a date range, optionally one barangay of origin
const db = require('../db');

async function compileFigures(scope) {
  const s = scope !== null && typeof scope === 'object' ? scope : { incidentId: scope };
  const isIncident = s.incidentId != null;
  const params = isIncident ? [s.incidentId] : [s.from, s.to];
  const where = isIncident
    ? 'er.incident_id = $1'
    : 'er.date_evacuated >= $1::date AND er.date_evacuated < $2::date + 1';
  params.push(s.brgy || null);
  const brgyParam = `$${params.length}`;

  const { rows } = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (er.evacuee_id) er.evacuee_id, er.center_id, er.status
      FROM EVACUATION_RECORDS er
      WHERE ${where}
      ORDER BY er.evacuee_id, er.date_evacuated DESC, er.record_id DESC
    )
    SELECT l.evacuee_id, l.center_id, l.status, e.family_id, e.age, e.gender, e.birthdate,
           COALESCE(f.barangay, 'Unknown') AS origin,
           c.center_name, c.address AS center_address, c.barangay AS center_barangay, c.status AS center_status, c.capacity
    FROM latest l
    JOIN EVACUEES e ON e.evacuee_id = l.evacuee_id
    LEFT JOIN FAMILIES f ON f.family_id = e.family_id
    JOIN EVACUATION_CENTERS c ON c.center_id = l.center_id
    WHERE (${brgyParam}::text IS NULL OR COALESCE(f.barangay, 'Unknown') = ${brgyParam})
  `, params);

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

  // One line per (evacuation center, barangay of origin) - what the Excel DROMIC template lists.
  // Age bands follow the template: infant 0-6 mos, toddler 7 mos-2 y, preschool 3-5, school age 6-12, teen 13-17, adult 18-59, elderly 60+.
  const nowDate = new Date();
  const bandOfPerson = (r) => {
    if (r.birthdate) {
      const b = new Date(r.birthdate);
      const months = (nowDate.getFullYear() - b.getFullYear()) * 12 + (nowDate.getMonth() - b.getMonth()) - (nowDate.getDate() < b.getDate() ? 1 : 0);
      if (months >= 0 && months <= 6) return 'infant';
      if (months >= 7 && months <= 35) return 'toddler';
    }
    const a = r.age;
    if (a == null) return null;
    if (a === 0) return 'infant';          // no birthdate on file, so under 1 year is counted as infant
    if (a <= 2) return 'toddler';
    if (a <= 5) return 'preschool';
    if (a <= 12) return 'school';
    if (a <= 17) return 'teen';
    if (a <= 59) return 'adult';
    return 'elderly';
  };
  const caseKey = { 'Pregnant': 'pregnant', 'Lactating Mother': 'lactating', 'Solo Parent': 'solo', 'PWD': 'pwd' };
  const casesOf = new Map();
  pri.forEach(p => { const k = caseKey[p.case_type]; if (!k) return; if (!casesOf.has(p.evacuee_id)) casesOf.set(p.evacuee_id, new Set()); casesOf.get(p.evacuee_id).add(k); });

  const ecRows = [...group(rows, r => `${r.center_id}|${r.origin}`)].map(([, list]) => {
    const now = list.filter(r => r.status === 'Present');
    const age = {}, vuln = {};
    list.forEach(r => {
      const isNow = r.status === 'Present';
      const sexOffset = r.gender === 'Male' ? 0 : r.gender === 'Female' ? 2 : null;
      const band = bandOfPerson(r);
      if (band && sexOffset !== null) {
        age[band] = age[band] || [0, 0, 0, 0];
        age[band][sexOffset]++; if (isNow) age[band][sexOffset + 1]++;
      }
      (casesOf.get(r.evacuee_id) || []).forEach(k => {
        if (k === 'pregnant' || k === 'lactating') { vuln[k] = vuln[k] || [0, 0]; vuln[k][0]++; if (isNow) vuln[k][1]++; }
        else if (sexOffset !== null) { vuln[k] = vuln[k] || [0, 0, 0, 0]; vuln[k][sexOffset]++; if (isNow) vuln[k][sexOffset + 1]++; }
      });
    });
    return {
      center_id: list[0].center_id, center_name: list[0].center_name, address: list[0].center_address || '',
      origin: list[0].origin,
      families_cum: uniq(list.map(famKey)), families_now: uniq(now.map(famKey)),
      persons_cum: list.length, persons_now: now.length, age, vuln
    };
  });

  return {
    totals: {
      families_cum: uniq(rows.map(famKey)), persons_cum: rows.length,
      families_now: uniq(present.map(famKey)), persons_now: present.length,
      centers_cum: uniq(rows.map(r => r.center_id)), centers_now: uniq(present.map(r => r.center_id)),
      barangays_affected: byOrigin.filter(b => b.barangay !== 'Unknown').length
    },
    byOrigin, centers, ecRows,
    profile: {
      male: present.filter(r => r.gender === 'Male').length,
      female: present.filter(r => r.gender === 'Female').length,
      ages,
      vulnerable: Object.entries(vulnerable).map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n)
    }
  };
}

module.exports = { compileFigures };