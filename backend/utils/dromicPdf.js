// DROMIC report builders. Both are exported from this file:
//   buildDromicPdf  - the printable A4 report (pdfkit)
//   buildDromicXlsx - the report filled into the official DSWD Excel template (jszip)
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const PDFDocument = require('pdfkit');

// Builds the printable A4 DROMIC report, laid out like the DSWD DROMIC reports:
//   "DROMIC Report #N on <disaster> as of <date, time>"
//   I.   Situation Overview
//   II.  Status of Affected Areas and Population            (Table 1)
//   III. Status of Displaced Population - inside / outside  (Table 2)
//   IV.  Profile of Displaced Population                    (Table 3)
// Figures come from the snapshot taken when the report was generated.

const LOGO = path.join(__dirname, '..', 'assets', 'san-nicolas-logo.png');
const C = { navy: '#0B1A47', accent: '#1F5FBF', text: '#1f2937', muted: '#6b7280', line: '#d9e1ef', soft: '#f3f6fc', white: '#ffffff', ok: '#127A45', okBg: '#e3f5ec', blue: '#1F5FBF', blueBg: '#e3edfb', warn: '#9a6700' };
const PAGE = { w: 595.28, h: 841.89, m: 42 };
const W = PAGE.w - PAGE.m * 2;
const BOTTOM = PAGE.h - 64;

const TZ = 'Asia/Manila';
const dateLong = d => new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' });
const timeShort = d => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dateTime = d => (d ? `${dateLong(d)}, ${timeShort(d)}` : '—');
const n = v => Number(v || 0).toLocaleString('en-US');
const plural = (c, one, many) => `${n(c)} ${c === 1 ? one : many}`;
const STATUS_LABEL = { Draft: 'DRAFT', Active: 'ON-GOING', Finalized: 'FINAL REPORT' };
const INCIDENT_LABEL = { Pending: 'Pending response', 'En Route': 'Responders en route', Active: 'Active (on-going)', Resolved: 'Resolved' };

function buildDromicPdf(data, out) {
  const { report, totals = {}, byOrigin = [], centers = [], profile = {} } = data;
  const t = { families_cum: 0, persons_cum: 0, families_now: 0, persons_now: 0, centers_cum: 0, centers_now: 0, barangays_affected: 0, ...totals };
  const reportNo = report.report_no || report.report_id;
  const asOf = report.as_of || report.report_date;
  const author = `${report.author_first || ''} ${report.author_last || ''}`.trim() || '—';
  const name = report.disaster_name || 'the disaster';

  const doc = new PDFDocument({
    size: 'A4', margin: PAGE.m, bufferPages: true,
    info: { Title: `DROMIC Report #${reportNo} on ${name} as of ${dateTime(asOf)}`, Author: 'MDRRMO San Nicolas, Ilocos Norte', Subject: 'DROMIC Report', Creator: 'RESCOM' }
  });
  doc.pipe(out);
  let y = PAGE.m;

  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = PAGE.m; } };
  const textH = (s, size, width, font = 'Helvetica') => { doc.font(font).fontSize(size); return doc.heightOfString(String(s), { width }); };

  // ---------- header ----------
  if (fs.existsSync(LOGO)) { try { doc.image(LOGO, PAGE.m, y, { fit: [54, 54] }); } catch (_) { /* never fail over a logo */ } }
  const hx = PAGE.m + 66;
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('Republic of the Philippines', hx, y + 2, { lineBreak: false });
  doc.text('Province of Ilocos Norte  ·  Municipality of San Nicolas', hx, y + 13, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.navy).text('MUNICIPAL DISASTER RISK REDUCTION AND MANAGEMENT OFFICE', hx, y + 27, { lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('Disaster Response Operations Monitoring and Information Center (DROMIC)', hx, y + 41, { lineBreak: false });
  y += 62;
  doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(1.5).strokeColor(C.navy).stroke();
  y += 14;

  // ---------- title ----------
  const label = STATUS_LABEL[report.reporting_status] || String(report.reporting_status || '').toUpperCase();
  const chipW = doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(label) + 18;
  const finalRep = report.reporting_status === 'Finalized';
  doc.roundedRect(PAGE.m + W - chipW, y + 2, chipW, 18, 9).fill(finalRep ? C.okBg : C.blueBg);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(finalRep ? C.ok : C.blue).text(label, PAGE.m + W - chipW, y + 7, { width: chipW, align: 'center', lineBreak: false });
  const titleW = W - chipW - 12;
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.navy);
  const title = `MDRRMO DROMIC Report #${reportNo} on ${name}`;
  const th = doc.heightOfString(title, { width: titleW });
  doc.text(title, PAGE.m, y, { width: titleW });
  y += th + 3;
  doc.font('Helvetica').fontSize(10.5).fillColor(C.text).text(`as of ${dateTime(asOf)}`, PAGE.m, y, { lineBreak: false });
  y += 24;

  // ---------- building blocks ----------
  const section = s => {
    ensure(40);
    doc.rect(PAGE.m, y + 1, 4, 14).fill(C.accent);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.navy).text(s, PAGE.m + 12, y, { lineBreak: false });
    y += 24;
  };
  const sub = s => { ensure(26); doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text).text(s, PAGE.m, y, { lineBreak: false }); y += 17; };
  const para = (s, o = {}) => {
    const size = o.size || 9.8, font = o.bold ? 'Helvetica-Bold' : 'Helvetica';
    const h = textH(s, size, W, font);
    ensure(h + 4);
    doc.font(font).fontSize(size).fillColor(o.color || C.text).text(s, PAGE.m, y, { width: W, lineGap: 2 });
    y += h + (o.after ?? 8);
  };
  const caption = s => { ensure(18); doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text(s, PAGE.m, y, { lineBreak: false }); y += 14; };

  // cols: [{ label, w, align }]; rows: arrays of cell strings; opts.total: bold last row
  function table(cols, rows, opts = {}) {
    const pad = 6;
    const widths = cols.map(c => c.w);
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(8.5);
      const hh = Math.max(...cols.map(c => doc.heightOfString(c.label, { width: c.w - pad * 2 }))) + 12;
      doc.rect(PAGE.m, y, W, hh).fill(C.navy);
      let x = PAGE.m;
      cols.forEach(c => { doc.fillColor(C.white).text(c.label, x + pad, y + 6, { width: c.w - pad * 2, align: c.align || 'left' }); x += c.w; });
      y += hh;
    };
    ensure(60); header();
    rows.forEach((r, idx) => {
      const isTotal = opts.total && idx === rows.length - 1;
      const font = isTotal ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fontSize(9);
      const rh = Math.max(...r.map((cell, i) => doc.heightOfString(String(cell ?? '—'), { width: widths[i] - pad * 2 }))) + 12;
      if (y + rh > BOTTOM) { doc.addPage(); y = PAGE.m; header(); }
      if (isTotal) doc.rect(PAGE.m, y, W, rh).fill('#e6ecf8'); else if (idx % 2 === 0) doc.rect(PAGE.m, y, W, rh).fill(C.soft);
      let x = PAGE.m;
      r.forEach((cell, i) => { doc.font(font).fontSize(9).fillColor(C.text).text(String(cell ?? '—'), x + pad, y + 6, { width: widths[i] - pad * 2, align: cols[i].align || 'left' }); x += widths[i]; });
      y += rh;
      doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(0.5).strokeColor(C.line).stroke();
    });
    y += 6;
  }

  // ---------- I. Situation overview ----------
  section('I. Situation Overview');
  const where = report.brgy ? `in ${report.brgy}` : 'in the Municipality of San Nicolas';
  let overview = `${name}${report.disaster_type ? ` (${report.disaster_type})` : ''} was logged by the MDRRMO ${where} on ${report.date_started ? dateLong(report.date_started) : 'an unrecorded date'}`;
  overview += report.severity ? `, with ${String(report.severity).toLowerCase()} severity.` : '.';
  overview += ` Incident status as of this report: ${INCIDENT_LABEL[report.incident_status] || report.incident_status || 'not recorded'}.`;
  if (report.date_ended) overview += ` The incident was marked resolved on ${dateLong(report.date_ended)}.`;
  para(overview, { after: 4 });
  if (report.incident_remarks) para(report.incident_remarks, { color: C.muted, after: 4 });
  para('Source: MDRRMO San Nicolas incident log', { size: 8.5, color: C.muted, after: 12 });

  // ---------- II. Affected ----------
  section('II. Status of Affected Areas and Population');
  para(`A total of ${plural(t.families_cum, 'family', 'families')} or ${plural(t.persons_cum, 'person', 'persons')} were affected by ${name} in ${plural(t.barangays_affected, 'barangay', 'barangays')} (see Table 1).`, { after: 4 });
  para('Counts cover the families registered at evacuation centers through RESCOM.', { size: 8.5, color: C.muted, after: 8 });
  caption('Table 1. Number of Affected Families / Persons by Barangay of Origin');
  if (byOrigin.length) {
    table([{ label: 'Barangay of Origin', w: W - 200 }, { label: 'Affected Families', w: 100, align: 'right' }, { label: 'Affected Persons', w: 100, align: 'right' }],
      [...byOrigin.map(b => [b.barangay, n(b.families), n(b.persons)]), ['TOTAL', n(t.families_cum), n(t.persons_cum)]], { total: true });
  } else para('No evacuees have been registered under this incident yet.', { color: C.muted });
  para('Source: MDRRMO San Nicolas evacuee registrations', { size: 8.5, color: C.muted, after: 12 });

  // ---------- III. Displaced ----------
  section('III. Status of Displaced Population');
  sub('Inside Evacuation Centers');
  para(`There are ${plural(t.families_now, 'family', 'families')} or ${plural(t.persons_now, 'person', 'persons')} currently taking temporary shelter in ${plural(t.centers_now, 'evacuation center', 'evacuation centers')} (see Table 2). In total, ${plural(t.families_cum, 'family', 'families')} or ${plural(t.persons_cum, 'person', 'persons')} have been registered in ${plural(t.centers_cum, 'evacuation center', 'evacuation centers')} since the incident began.`, { after: 8 });
  caption('Table 2. Number of Displaced Families / Persons Inside Evacuation Centers');
  if (centers.length) {
    const cw = 62, first = W - cw * 6;
    table([{ label: 'Evacuation Center', w: first }, { label: 'Families (Cum)', w: cw, align: 'right' }, { label: 'Families (Now)', w: cw, align: 'right' }, { label: 'Persons (Cum)', w: cw, align: 'right' }, { label: 'Persons (Now)', w: cw, align: 'right' }, { label: 'Male (Now)', w: cw, align: 'right' }, { label: 'Female (Now)', w: cw, align: 'right' }],
      [...centers.map(c => [`${c.center_name}${c.barangay ? `\n${c.barangay}` : ''}`, n(c.families_cum), n(c.families_now), n(c.persons_cum), n(c.persons_now), n(c.male_now), n(c.female_now)]),
        ['TOTAL', n(t.families_cum), n(t.families_now), n(t.persons_cum), n(t.persons_now), n(profile.male), n(profile.female)]], { total: true });
  } else para('No evacuation center records for this incident yet.', { color: C.muted });
  para('Cum = all registered since the incident began.  Now = currently staying in the center.', { size: 8.5, color: C.muted, after: 6 });
  sub('Outside Evacuation Centers');
  para('Not recorded. RESCOM registers evacuees at evacuation centers only, so families staying with relatives or friends are not counted.', { color: C.muted, after: 12 });

  // ---------- IV. Profile ----------
  section('IV. Profile of Displaced Population Inside Evacuation Centers');
  caption('Table 3. Profile of persons currently inside evacuation centers');
  const ages = profile.ages || {};
  const rows3 = [
    ['Sex', 'Male', n(profile.male)], ['Sex', 'Female', n(profile.female)],
    ['Age group', '0 - 4 years old', n(ages['0-4'])], ['Age group', '5 - 17 years old', n(ages['5-17'])],
    ['Age group', '18 - 59 years old', n(ages['18-59'])], ['Age group', '60 years old and above (senior citizens)', n(ages['60+'])],
    ...((profile.vulnerable || []).length ? profile.vulnerable.map(v => ['Vulnerable sector', v.type, n(v.n)]) : [['Vulnerable sector', 'None flagged', '0']])
  ];
  table([{ label: 'Category', w: 130 }, { label: 'Group', w: W - 230 }, { label: 'Persons', w: 100, align: 'right' }], rows3);
  para('Damaged houses and cost of assistance are not recorded in RESCOM and are not part of this report.', { size: 8.5, color: C.muted, after: 12 });

  // ---------- Remarks + sign-off ----------
  if (report.field_remarks) { section('V. Field Remarks'); para(report.field_remarks, { after: 12 }); }
  ensure(80);
  y += 6;
  const sx = PAGE.m, sx2 = PAGE.m + W / 2 + 10, sw = W / 2 - 30;
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Prepared by:', sx, y, { lineBreak: false }).text('Noted by:', sx2, y, { lineBreak: false });
  doc.moveTo(sx, y + 34).lineTo(sx + sw, y + 34).lineWidth(0.7).strokeColor(C.text).stroke();
  doc.moveTo(sx2, y + 34).lineTo(sx2 + sw, y + 34).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(author, sx, y + 38, { width: sw, lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text('MDRRM Officer', sx2, y + 38, { width: sw, lineBreak: false });
  y += 60;

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const fy = PAGE.h - 40;
    doc.moveTo(PAGE.m, fy - 6).lineTo(PAGE.m + W, fy - 6).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text(`MDRRMO San Nicolas, Ilocos Norte  |  DROMIC Report #${reportNo} as of ${dateTime(asOf)}`, PAGE.m, fy, { width: W - 70, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.m + W - 70, fy, { width: 70, align: 'right', lineBreak: false });
  }
  doc.end();
}

// Fills the official DSWD DROMIC master workbook (templates/Blank-DROMIC-Template.xlsx)
// with RESCOM figures, so the report opens in Excel exactly like the template and
// the staff can keep editing it.
//
// How it works: an .xlsx is a zip of XML files. We open the template, write ONLY the
// input cells (INFORMATION sheet + the San Nicolas block of the REGION I sheet) and
// leave every formula, style, filter and total untouched. Excel recalculates all the
// totals the moment the file is opened (fullCalcOnLoad).

const TEMPLATE = path.join(__dirname, '..', 'templates', 'Blank-DROMIC-Template.xlsx');

// REGION I sheet: San Nicolas municipality row is 184, its 38 detail rows are 185..222.
const FIRST_ROW = 185;
const LAST_ROW = 222;
const SLOTS = LAST_ROW - FIRST_ROW + 1;

// Age bands in template order. Each band owns 4 columns: Male CUM, Male NOW, Female CUM, Female NOW.
const BAND_START = { infant: 'AI', toddler: 'AM', preschool: 'AQ', school: 'AU', teen: 'AY', adult: 'BC', elderly: 'BG' };

// ---------- tiny column helpers ----------
const colToNum = (c) => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const numToCol = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const shift = (c, by) => numToCol(colToNum(c) + by);

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace the value of one existing cell in a row's XML, keeping its style (s="..").
function patchCell(rowXml, ref, value) {
  const re = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = rowXml.match(re);
  if (!m) throw new Error(`Template cell ${ref} not found`);
  const style = (m[1].match(/\ss="\d+"/) || [''])[0];
  let cell;
  if (value === null || value === undefined || value === '') cell = `<c r="${ref}"${style}/>`;
  else if (typeof value === 'number') cell = `<c r="${ref}"${style}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  return rowXml.replace(re, cell);
}

// Apply {A1: value, ...} edits to a sheet's XML, row by row.
function patchSheet(xml, edits) {
  const byRow = new Map();
  for (const [ref, val] of Object.entries(edits)) {
    const row = Number(ref.match(/\d+$/)[0]);
    if (!byRow.has(row)) byRow.set(row, {});
    byRow.get(row)[ref] = val;
  }
  for (const [row, cells] of byRow) {
    const start = xml.indexOf(`<row r="${row}" `);
    if (start < 0) throw new Error(`Template row ${row} not found`);
    const end = xml.indexOf('</row>', start) + 6;
    let rowXml = xml.slice(start, end);
    for (const [ref, val] of Object.entries(cells)) rowXml = patchCell(rowXml, ref, val);
    xml = xml.slice(0, start) + rowXml + xml.slice(end);
  }
  return xml;
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }) : '';
const fmtAsOf = (d) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function reportLabel(report) {
  if (report.reporting_status === 'Finalized') return 'Final Report';
  return report.report_no > 1 ? `Progress Report No. ${report.report_no}` : 'Initial Report';
}

// Turns the compiled ecRows into the cells of the 38 detail rows.
function buildDetailEdits(ecRows) {
  // A center is "NOW" if anyone is still inside it, across all of its barangay lines.
  const centerNow = new Map();
  ecRows.forEach(r => centerNow.set(r.center_id, (centerNow.get(r.center_id) || 0) + r.persons_now));
  let rows = ecRows.slice();

  // More (center x barangay) lines than the 38 slots? Merge the smallest into one "Others" line.
  let overflow = false;
  if (rows.length > SLOTS) {
    overflow = true;
    rows.sort((a, b) => b.persons_cum - a.persons_cum);
    const keep = rows.slice(0, SLOTS - 1), rest = rows.slice(SLOTS - 1);
    const merged = { center_id: 'others', center_name: 'Other evacuation centers (see RESCOM)', address: '', origin: `Others (${new Set(rest.map(r => r.origin)).size} barangays)`,
      families_cum: 0, families_now: 0, persons_cum: 0, persons_now: 0, age: {}, vuln: {}, isOthers: true };
    rest.forEach(r => {
      ['families_cum', 'families_now', 'persons_cum', 'persons_now'].forEach(k => (merged[k] += r[k]));
      Object.entries(r.age).forEach(([k, v]) => { merged.age[k] = (merged.age[k] || [0, 0, 0, 0]).map((n, i) => n + v[i]); });
      Object.entries(r.vuln).forEach(([k, v]) => { merged.vuln[k] = (merged.vuln[k] || [0, 0]).map((n, i) => n + v[i]); });
    });
    rows = keep.concat(merged);
  }
  rows.sort((a, b) => String(a.center_name).localeCompare(String(b.center_name)) || String(a.origin).localeCompare(String(b.origin), undefined, { numeric: true }));

  const edits = {};
  const seenCenter = new Set(), seenBrgy = new Set();
  rows.slice(0, SLOTS).forEach((r, i) => {
    const n = FIRST_ROW + i;
    const firstOfCenter = !seenCenter.has(r.center_id); seenCenter.add(r.center_id);
    const firstOfBrgy = !seenBrgy.has(r.origin) && !r.isOthers; seenBrgy.add(r.origin);

    // Number of affected. RESCOM only knows the families that evacuated, so affected = displaced here
    // (Non-IDPs stays 0). Staff can raise J/K in Excel if more families were affected but did not evacuate.
    edits[`H${n}`] = r.origin; if (firstOfBrgy) edits[`I${n}`] = 1;
    edits[`J${n}`] = r.families_cum; edits[`K${n}`] = r.persons_cum;
    // Evacuation center (counted once, on its first line)
    if (firstOfCenter) {
      edits[`M${n}`] = r.isOthers ? 0 : 1; edits[`N${n}`] = (!r.isOthers && centerNow.get(r.center_id) > 0) ? 1 : 0;
      edits[`Q${n}`] = r.center_name; edits[`R${n}`] = r.address || '';
    }
    // Origin of IDPs + displaced inside ECs. Outside ECs is not tracked by RESCOM, so it stays 0.
    edits[`S${n}`] = r.origin; if (firstOfBrgy) edits[`T${n}`] = 1;
    edits[`U${n}`] = r.families_cum; edits[`V${n}`] = r.families_now;
    edits[`W${n}`] = r.persons_cum;  edits[`X${n}`] = r.persons_now;
    ['Y', 'Z', 'AA', 'AB'].forEach(c => (edits[`${c}${n}`] = 0));

    // Sex & age distribution
    Object.entries(BAND_START).forEach(([band, startCol]) => {
      const v = r.age[band] || [0, 0, 0, 0]; // [M cum, M now, F cum, F now]
      v.forEach((num, k) => (edits[`${shift(startCol, k)}${n}`] = num));
    });
    // Vulnerable sectors: Pregnant BO-BP, Lactating BQ-BR, Solo Parent (M CA-CB, F CC-CD), PWD (M CE-CF, F CG-CH)
    const vu = r.vuln;
    const pair = (key, col, idx) => { const v = vu[key] || [0, 0, 0, 0]; edits[`${col}${n}`] = v[idx]; };
    edits[`BO${n}`] = (vu.pregnant || [0, 0])[0]; edits[`BP${n}`] = (vu.pregnant || [0, 0])[1];
    edits[`BQ${n}`] = (vu.lactating || [0, 0])[0]; edits[`BR${n}`] = (vu.lactating || [0, 0])[1];
    ['CA', 'CB', 'CC', 'CD'].forEach((c, k) => pair('solo', c, k));
    ['CE', 'CF', 'CG', 'CH'].forEach((c, k) => pair('pwd', c, k));
  });
  return { edits, overflow, used: Math.min(rows.length, SLOTS) };
}

async function buildDromicXlsx(data) {
  const { report, ecRows = [] } = data;
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));

  // ---- INFORMATION sheet (sheet1.xml) ----
  const author = [report.author_first, report.author_last].filter(Boolean).join(' ');
  const info = {
    C7: report.disaster_name || '',
    C8: author,
    C10: report.reporting_status === 'Finalized' ? 'Terminated' : 'On-Going', // the template's dropdown values
    C11: fmtDate(report.date_started),
    C12: report.field_remarks || ''
  };
  zip.file('xl/worksheets/sheet1.xml', patchSheet(await zip.file('xl/worksheets/sheet1.xml').async('string'), info));

  // ---- REGION I sheet (sheet5.xml) ----
  const { edits, overflow, used } = buildDetailEdits(ecRows);
  Object.assign(edits, {
    M1: `Incident: ${report.disaster_name || ''}`,
    M2: reportLabel(report),
    S1: `As of Date and Time: ${fmtAsOf(report.as_of || report.report_date)}`,
    AC1: `Prepared by: ${author}`,
    AC2: `Contact No.: ${report.author_phone || ''}`
  });
  zip.file('xl/worksheets/sheet5.xml', patchSheet(await zip.file('xl/worksheets/sheet5.xml').async('string'), edits));

  // ---- make Excel recalculate every total when the file is opened ----
  let wb = await zip.file('xl/workbook.xml').async('string');
  wb = wb.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="162913" fullCalcOnLoad="1"/>');
  zip.file('xl/workbook.xml', wb);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, overflow, rowsUsed: used };
}

module.exports = { buildDromicPdf, buildDromicXlsx, FIRST_ROW, LAST_ROW };