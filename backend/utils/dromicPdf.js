// Fills the official DSWD DROMIC master workbook (templates/Blank-DROMIC-Template.xlsx)
// with RESCOM figures, so the report opens in Excel exactly like the template and
// the staff can keep editing it.
//
// How it works: an .xlsx is a zip of XML files. We open the template, write ONLY the
// input cells (INFORMATION sheet + the San Nicolas block of the REGION I sheet) and
// leave every formula, style, filter and total untouched. Excel recalculates all the
// totals the moment the file is opened (fullCalcOnLoad).
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');

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

module.exports = { buildDromicXlsx, FIRST_ROW, LAST_ROW };