// DROMIC PDF report builder. Figures come from a shared report snapshot.
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// Builds the printable A4 DROMIC report, laid out like the DSWD DROMIC reports:
//   "DROMIC Report #N on <disaster> as of <date, time>"
//   I.   Situation Overview
//   II.  Status of Affected Areas and Population            (Table 1)
//   III. Status of Displaced Population - inside / outside  (Table 2)
//   IV.  Profile of Displaced Population                    (Table 3)
// Figures come from the snapshot taken when the report was generated.

const LOGO = path.join(__dirname, '..', 'assets', 'san-nicolas-logo-bw.png');
const FONT = 'Times-Roman';
const BOLD = 'Times-Bold';
const SIZE = 12;
const BLACK = '#000000';
const PAGE = { w: 595.28, h: 841.89, m: 42 };
const W = PAGE.w - PAGE.m * 2;

const TZ = 'Asia/Manila';
const dateLong = d => new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' });
const timeShort = d => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dateTime = d => (d ? `${dateLong(d)}, ${timeShort(d)}` : '—');
const n = v => Number(v || 0).toLocaleString('en-US');
const plural = (c, one, many) => `${n(c)} ${c === 1 ? one : many}`;
const STATUS_LABEL = { Draft: 'DRAFT', Active: 'ISSUED', Finalized: 'FINAL REPORT' };
const INCIDENT_LABEL = { Pending: 'Pending response', 'En Route': 'Responders en route', Active: 'Active (on-going)', Resolved: 'Resolved' };

function incidentSentence(report, name, where) {
  let s = `${name}${report.disaster_type ? ` (${report.disaster_type})` : ''} was logged by the MDRRMO ${where} on ${report.date_started ? dateLong(report.date_started) : 'an unrecorded date'}`;
  s += report.severity ? `, with ${String(report.severity).toLowerCase()} severity.` : '.';
  s += ` Incident status as of this report: ${INCIDENT_LABEL[report.incident_status] || report.incident_status || 'not recorded'}.`;
  if (report.date_ended) s += ` The incident was marked resolved on ${dateLong(report.date_ended)}.`;
  return s;
}

function periodSentence(p, where) {
  let s = `${p.incidents} ${p.incidents === 1 ? 'incident was' : 'incidents were'} logged by the MDRRMO ${where} from ${dateLong(p.from)} to ${dateLong(p.to)}, and ${p.resolved} ${p.resolved === 1 ? 'was' : 'were'} resolved.`;
  if (p.types) s += ` By type: ${p.types}.`;
  return s;
}

function buildDromicPdf(data, out) {
  const { report, totals = {}, byOrigin = [], centers = [], profile = {} } = data;
  const t = { families_cum: 0, persons_cum: 0, families_now: 0, persons_now: 0, centers_cum: 0, centers_now: 0, barangays_affected: 0, ...totals };
  const reportNo = report.report_no || report.report_id;
  const asOf = report.as_of || report.report_date;
  const author = `${report.author_first || ''} ${report.author_last || ''}`.trim() || '—';
  const name = report.disaster_name || 'the disaster';
  const title = report.period ? `MDRRMO ${name}` : `MDRRMO DROMIC Report #${reportNo} on ${name}`;
  // Short line for the top of every page, next to the page number.
  const runningLeft = report.period ? name : `DROMIC Report #${reportNo}`;

  const doc = new PDFDocument({
    size: 'A4', margin: PAGE.m, bufferPages: true,
    info: { Title: report.period ? `${name}, ${report.period.label}` : `DROMIC Report #${reportNo} on ${name} as of ${dateTime(asOf)}`, Author: 'MDRRMO San Nicolas, Ilocos Norte', Subject: 'DROMIC Report', Creator: 'RESCOM' }
  });
  doc.pipe(out);
  let y = PAGE.m;

  // Black and white, Times 12pt throughout. No footer; page numbers go in the header.
  const BOTTOM = PAGE.h - PAGE.m;
  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = PAGE.m; } };
  const setText = (font = FONT) => doc.font(font).fontSize(SIZE).fillColor(BLACK);

  // ---------- header (first page) ----------
  if (fs.existsSync(LOGO)) { try { doc.image(LOGO, PAGE.m, y, { fit: [56, 56] }); } catch (_) { /* never fail over a logo */ } }
  const hx = PAGE.m + 70, hw = W - 70;
  let hy = y;
  const headerLine = (s, font) => {
    setText(font);
    const h = doc.heightOfString(s, { width: hw });
    doc.text(s, hx, hy, { width: hw });
    hy += h + 1;
  };
  headerLine('Republic of the Philippines', FONT);
  headerLine('Province of Ilocos Norte, Municipality of San Nicolas', FONT);
  headerLine('MUNICIPAL DISASTER RISK REDUCTION AND MANAGEMENT OFFICE', BOLD);
  headerLine('Disaster Response Operations Monitoring and Information Center (DROMIC)', FONT);
  y = Math.max(y + 60, hy + 4);
  doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(1).strokeColor(BLACK).stroke();
  y += 14;

  // ---------- title ----------
  const label = report.period ? 'SITUATION REPORT' : (STATUS_LABEL[report.reporting_status] || String(report.reporting_status || '').toUpperCase());
  setText(BOLD);
  const chipW = doc.widthOfString(label) + 16;
  const chipH = 18;
  doc.roundedRect(PAGE.m + W - chipW, y, chipW, chipH, 3).lineWidth(0.8).strokeColor(BLACK).stroke();
  setText(BOLD);
  doc.text(label, PAGE.m + W - chipW, y + 3, { width: chipW, align: 'center', lineBreak: false });
  const titleW = W - chipW - 12;
  setText(BOLD);
  const th = doc.heightOfString(title, { width: titleW });
  doc.text(title, PAGE.m, y, { width: titleW });
  y += Math.max(th, chipH) + 4;
  setText(FONT);
  doc.text(`as of ${dateTime(asOf)}`, PAGE.m, y, { lineBreak: false });
  y += 22;

  // ---------- building blocks ----------
  const section = s => { ensure(40); setText(BOLD); doc.text(s, PAGE.m, y, { lineBreak: false }); y += 20; };
  const sub = s => { ensure(26); setText(BOLD); doc.text(s, PAGE.m, y, { lineBreak: false }); y += 17; };
  const para = (s, o = {}) => {
    const font = o.bold ? BOLD : FONT;
    setText(font);
    const h = doc.heightOfString(String(s), { width: W, lineGap: 1 });
    ensure(h + 4);
    setText(font);
    doc.text(String(s), PAGE.m, y, { width: W, lineGap: 1 });
    y += h + (o.after ?? 8);
  };
  const caption = s => { ensure(18); setText(BOLD); doc.text(s, PAGE.m, y, { lineBreak: false }); y += 16; };

  // cols: [{ label, w, align }]; rows: arrays of cell strings; opts.total: bold last row
  function table(cols, rows, opts = {}) {
    const pad = 4;
    const widths = cols.map(c => c.w);
    const header = () => {
      setText(BOLD);
      const hh = Math.max(...cols.map(c => doc.heightOfString(c.label, { width: c.w - pad * 2 }))) + 8;
      let x = PAGE.m;
      cols.forEach(c => { doc.text(c.label, x + pad, y + 4, { width: c.w - pad * 2, align: c.align || 'left' }); x += c.w; });
      y += hh;
      doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(1).strokeColor(BLACK).stroke();
      y += 2;
    };
    ensure(60); header();
    rows.forEach((r, idx) => {
      const isTotal = opts.total && idx === rows.length - 1;
      const font = isTotal ? BOLD : FONT;
      setText(font);
      const rh = Math.max(...r.map((cell, i) => doc.heightOfString(String(cell ?? '—'), { width: widths[i] - pad * 2 }))) + 8;
      if (y + rh > BOTTOM) { doc.addPage(); y = PAGE.m; header(); }
      if (isTotal) doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(1).strokeColor(BLACK).stroke();
      let x = PAGE.m;
      r.forEach((cell, i) => {
        setText(font);
        doc.text(String(cell ?? '—'), x + pad, y + 4, { width: widths[i] - pad * 2, align: cols[i].align || 'left' });
        x += widths[i];
      });
      y += rh;
      doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(0.4).strokeColor(BLACK).stroke();
    });
    y += 8;
  }

  // ---------- I. Situation overview ----------
  section('I. Situation Overview');
  const where = report.brgy ? `in ${report.brgy}` : 'in the Municipality of San Nicolas';
  const overview = report.period ? periodSentence(report.period, where) : incidentSentence(report, name, where);
  para(overview, { after: 6 });
  if (report.incident_remarks) para(report.incident_remarks, { after: 6 });
  para('Source: MDRRMO San Nicolas incident log', { after: 12 });

  // ---------- II. Affected ----------
  section('II. Status of Affected Areas and Population');
  para(`A total of ${plural(t.families_cum, 'family', 'families')} or ${plural(t.persons_cum, 'person', 'persons')} were affected ${report.period ? 'in this period' : `by ${name}`} in ${plural(t.barangays_affected, 'barangay', 'barangays')} (see Table 1).`, { after: 6 });
  para('Counts cover the families registered at evacuation centers through RESCOM.', { after: 8 });
  caption('Table 1. Number of Affected Families / Persons by Barangay of Origin');
  if (byOrigin.length) {
    table([{ label: 'Barangay of Origin', w: W - 200 }, { label: 'Affected Families', w: 100, align: 'right' }, { label: 'Affected Persons', w: 100, align: 'right' }],
      [...byOrigin.map(b => [b.barangay, n(b.families), n(b.persons)]), ['TOTAL', n(t.families_cum), n(t.persons_cum)]], { total: true });
  } else para(report.period ? 'No evacuees have been registered in this period.' : 'No evacuees have been registered under this incident yet.');
  para('Source: MDRRMO San Nicolas evacuee registrations', { after: 12 });

  // ---------- III. Displaced ----------
  section('III. Status of Displaced Population');
  sub('Inside Evacuation Centers');
  para(`There are ${plural(t.families_now, 'family', 'families')} or ${plural(t.persons_now, 'person', 'persons')} currently taking temporary shelter in ${plural(t.centers_now, 'evacuation center', 'evacuation centers')} (see Table 2). In total, ${plural(t.families_cum, 'family', 'families')} or ${plural(t.persons_cum, 'person', 'persons')} have been registered in ${plural(t.centers_cum, 'evacuation center', 'evacuation centers')} ${report.period ? 'in this period' : 'since the incident began'}.`, { after: 8 });
  caption('Table 2. Number of Displaced Families / Persons Inside Evacuation Centers');
  if (centers.length) {
    const cw = 62, first = W - cw * 6;
    table([{ label: 'Evacuation Center', w: first }, { label: 'Families (Cum)', w: cw, align: 'right' }, { label: 'Families (Now)', w: cw, align: 'right' }, { label: 'Persons (Cum)', w: cw, align: 'right' }, { label: 'Persons (Now)', w: cw, align: 'right' }, { label: 'Male (Now)', w: cw, align: 'right' }, { label: 'Female (Now)', w: cw, align: 'right' }],
      [...centers.map(c => [`${c.center_name}${c.barangay ? `\n${c.barangay}` : ''}`, n(c.families_cum), n(c.families_now), n(c.persons_cum), n(c.persons_now), n(c.male_now), n(c.female_now)]),
        ['TOTAL', n(t.families_cum), n(t.families_now), n(t.persons_cum), n(t.persons_now), n(profile.male), n(profile.female)]], { total: true });
  } else para(report.period ? 'No evacuation center records for this period.' : 'No evacuation center records for this incident yet.');
  para(report.period ? 'Cum = all registered in this period.  Now = currently staying in the center.' : 'Cum = all registered since the incident began.  Now = currently staying in the center.', { after: 6 });
  sub('Outside Evacuation Centers');
  para('Not recorded. RESCOM registers evacuees at evacuation centers only, so families staying with relatives or friends are not counted.', { after: 12 });

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
  para('Damaged houses and cost of assistance are not recorded in RESCOM and are not part of this report.', { after: 12 });

  // ---------- V. Remarks + sign-off ----------
  if (report.field_remarks) { section('V. Field Remarks'); para(report.field_remarks, { after: 12 }); }
  ensure(80);
  y += 6;
  const sx = PAGE.m, sx2 = PAGE.m + W / 2 + 10, sw = W / 2 - 30;
  setText(FONT);
  doc.text('Prepared by:', sx, y, { lineBreak: false });
  doc.text('Noted by:', sx2, y, { lineBreak: false });
  doc.moveTo(sx, y + 34).lineTo(sx + sw, y + 34).lineWidth(0.7).strokeColor(BLACK).stroke();
  doc.moveTo(sx2, y + 34).lineTo(sx2 + sw, y + 34).lineWidth(0.7).strokeColor(BLACK).stroke();
  setText(BOLD);
  doc.text(author, sx, y + 38, { width: sw, lineBreak: false });
  setText(FONT);
  doc.text('MDRRM Officer', sx2, y + 38, { width: sw, lineBreak: false });
  y += 60;

  // ---------- header on every page: title, then "Page 1/2" (no footer) ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const page = i - range.start + 1;
    const pageLabel = `Page ${page}/${range.count}`;
    const top = 18;
    setText(FONT);
    doc.text(runningLeft, PAGE.m, top, { width: W - 90, lineBreak: false });
    doc.text(pageLabel, PAGE.m + W - 90, top, { width: 90, align: 'right', lineBreak: false });
    doc.moveTo(PAGE.m, top + 16).lineTo(PAGE.m + W, top + 16).lineWidth(0.5).strokeColor(BLACK).stroke();
  }
  doc.end();
}

module.exports = { buildDromicPdf };
