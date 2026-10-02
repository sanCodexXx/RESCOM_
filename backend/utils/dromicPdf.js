// Builds the printable A4 DROMIC report.
//
// Layout is done with explicit coordinates (no `continued` text tricks) so
// columns can never run off the page or overlap. Every block measures itself
// first and moves to a new page if it would not fit.
//
// Logos live in backend/assets/:
//   san-nicolas-logo.png   MDRRMC seal  -> left of the header   (included)
//   municipal-seal.png     optional     -> right of the header  (drop the file in and it appears)
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO_LEFT = path.join(ASSETS, 'san-nicolas-logo.png');
const LOGO_RIGHT = path.join(ASSETS, 'municipal-seal.png');

const C = {
  navy: '#0B1A47', blue: '#0a1490', accent: '#1F5FBF',
  text: '#1f2937', muted: '#6b7280', line: '#d9e1ef', soft: '#f3f6fc',
  white: '#ffffff', ok: '#127A45', okBg: '#e3f5ec', warn: '#9a6700', warnBg: '#fdf3d7',
  bad: '#b42318', badBg: '#fde8e6', grey: '#4b5563', greyBg: '#eceff4', accentBg: '#e3edfb'
};
const STATUS_COLORS = {
  Draft: [C.grey, C.greyBg], Active: [C.accent, C.accentBg], Finalized: [C.ok, C.okBg],
  Open: [C.ok, C.okBg], Full: [C.bad, C.badBg], Standby: [C.grey, C.greyBg], Closed: [C.grey, C.greyBg]
};

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const W = PAGE.w - PAGE.m * 2;          // usable width
const BOTTOM = PAGE.h - 62;             // lowest y content may reach (footer lives below)
const RUN_TOP = PAGE.m + 46;            // where content starts on continuation pages

// Server may run in UTC; reports are for the Philippines.
function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

function buildDromicPdf(data, out) {
  const { report, centers, totals, priorityBreakdown } = data;
  const reportNo = `#${report.report_id}`;
  const author = `${report.author_first || ''} ${report.author_last || ''}`.trim() || '—';

  const doc = new PDFDocument({
    size: 'A4', margin: PAGE.m, bufferPages: true,
    info: {
      Title: `DROMIC Report ${reportNo} — ${report.disaster_name || ''}`.trim(),
      Author: 'MDRRMO San Nicolas, Ilocos Norte', Subject: 'DROMIC Report', Creator: 'RESCOM'
    }
  });
  doc.pipe(out);

  const hasLeft = fs.existsSync(LOGO_LEFT);
  const hasRight = fs.existsSync(LOGO_RIGHT);
  let y = PAGE.m;

  // ---------- small helpers ----------
  // Single-line text: anything wider than its box is shortened with an ellipsis instead of spilling out.
  const ellipsize = (str, width) => {
    if (!width || doc.widthOfString(str) <= width) return str;
    let s = str;
    while (s.length > 1 && doc.widthOfString(s + '…') > width) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  };
  const text = (str, x, yy, opts = {}) => doc.text(ellipsize(String(str ?? '—'), opts.width), x, yy, { lineBreak: false, ...opts });
  const h = (str, width, font, size) => { doc.font(font).fontSize(size); return doc.heightOfString(String(str ?? '—'), { width }); };

  function image(file, x, yy, size) {
    try { doc.image(file, x, yy, { fit: [size, size], align: 'center', valign: 'center' }); } catch (_) { /* never fail the report over a logo */ }
  }

  function chip(label, x, yy, align = 'left') {
    const [fg, bg] = STATUS_COLORS[label] || [C.grey, C.greyBg];
    doc.font('Helvetica-Bold').fontSize(8);
    const w = doc.widthOfString(label) + 18;
    const left = align === 'center' ? x - w / 2 : x;
    doc.roundedRect(left, yy, w, 16, 8).fill(bg);
    doc.fillColor(fg); text(label, left, yy + 4.5, { width: w, align: 'center' });
    return w;
  }

  // ---------- header (page 1) ----------
  function firstHeader() {
    const logo = 74, gap = 14, top = y;
    if (hasLeft) image(LOGO_LEFT, PAGE.m, top, logo);
    if (hasRight) image(LOGO_RIGHT, PAGE.m + W - logo, top, logo);

    // Text is centred in the space between the two logo slots (equal slots keep it truly centred).
    const cx = PAGE.m + logo + gap, cw = W - (logo + gap) * 2;
    const lines = [
      ['Republic of the Philippines', 'Helvetica', 9, C.muted],
      ['Province of Ilocos Norte', 'Helvetica', 9, C.muted],
      ['Municipality of San Nicolas', 'Helvetica-Bold', 12, C.navy],
      ['Municipal Disaster Risk Reduction and Management Office', 'Helvetica', 9, C.text]
    ];
    const total = lines.reduce((s, l) => s + h(l[0], cw, l[1], l[2]) + 2.5, 0);
    let ty = top + Math.max(0, (logo - total) / 2);
    lines.forEach(([t, f, s, col]) => {
      doc.font(f).fontSize(s).fillColor(col);
      doc.text(t, cx, ty, { width: cw, align: 'center', lineBreak: false });
      ty += h(t, cw, f, s) + 2.5;
    });

    y = top + logo + 10;
    doc.moveTo(PAGE.m, y).lineTo(PAGE.m + W, y).lineWidth(2).strokeColor(C.navy).stroke();
    doc.moveTo(PAGE.m, y + 3.5).lineTo(PAGE.m + W, y + 3.5).lineWidth(0.6).strokeColor(C.accent).stroke();
    y += 20;

    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.navy);
    text('DROMIC REPORT', PAGE.m, y, { width: W, align: 'center' });
    y += 26;
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
    text('Disaster Response Operations Monitoring and Information Center', PAGE.m, y, { width: W, align: 'center' });
    y += 20;
    chip(report.reporting_status, PAGE.m + W / 2, y, 'center');
    y += 32;
  }

  // ---------- header (continuation pages) ----------
  function runningHeader() {
    if (hasLeft) image(LOGO_LEFT, PAGE.m, PAGE.m - 4, 30);
    const tx = PAGE.m + (hasLeft ? 38 : 0);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy);
    text('DROMIC REPORT', tx, PAGE.m + 1);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
    text(`${report.disaster_name || ''}${report.brgy ? ' — ' + report.brgy : ''}`, tx, PAGE.m + 15, { width: W - 150 - (tx - PAGE.m) });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy);
    text(`Report ${reportNo}`, PAGE.m + W - 140, PAGE.m + 6, { width: 140, align: 'right' });
    doc.moveTo(PAGE.m, PAGE.m + 34).lineTo(PAGE.m + W, PAGE.m + 34).lineWidth(1).strokeColor(C.line).stroke();
  }

  function newPage() { doc.addPage(); runningHeader(); y = RUN_TOP; }
  function ensure(height) { if (y + height > BOTTOM) { newPage(); return true; } return false; }

  function section(title, keepWith = 60) {
    ensure(34 + keepWith);
    doc.rect(PAGE.m, y + 1, 4, 14).fill(C.accent);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.navy);
    text(title, PAGE.m + 12, y + 1.5);
    y += 24;
  }

  // ---------- report / incident details panel ----------
  function detailsPanel() {
    const colW = (W - 16) / 2, pad = 12, labelW = 74, valW = colW - pad * 2 - labelW;
    const left = [
      ['Report No.', reportNo], ['Status', report.reporting_status],
      ['Generated', fmt(report.report_date)], ['Generated By', author]
    ];
    const right = [
      ['Disaster', report.disaster_name], ['Type', report.disaster_type], ['Barangay', report.brgy],
      ['Severity', report.severity], ['Date Started', fmt(report.date_started)]
    ];
    const rowH = r => Math.max(h(r[0], labelW, 'Helvetica', 8.5), h(r[1], valW, 'Helvetica-Bold', 9.5)) + 7;
    const colH = rows => 24 + rows.reduce((s, r) => s + rowH(r), 0) + 6;
    const boxH = Math.max(colH(left), colH(right));
    ensure(boxH + 12);

    const draw = (x, title, rows) => {
      doc.roundedRect(x, y, colW, boxH, 6).lineWidth(0.8).fillAndStroke(C.soft, C.line);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent);
      text(title, x + pad, y + 10);
      let ry = y + 26;
      rows.forEach(r => {
        doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
        doc.text(r[0], x + pad, ry + 1, { width: labelW, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy);
        doc.text(String(r[1] ?? '—'), x + pad + labelW, ry, { width: valW });
        ry += rowH(r);
      });
    };
    draw(PAGE.m, 'REPORT DETAILS', left);
    draw(PAGE.m + colW + 16, 'INCIDENT DETAILS', right);
    y += boxH + 22;
  }

  // ---------- summary stat cards ----------
  function statCards() {
    section('Summary Figures', 70);
    const gap = 12, cw = (W - gap * 2) / 3, ch = 66;
    ensure(ch + 10);
    [
      ['Total Evacuated', totals.total_evacuated], ['Currently Present', totals.currently_present],
      ['Priority / Vulnerable', totals.priority_count]
    ].forEach(([label, val], i) => {
      const x = PAGE.m + i * (cw + gap);
      doc.roundedRect(x, y, cw, ch, 6).lineWidth(0.8).fillAndStroke(C.white, C.line);
      doc.rect(x + 1, y + 1, cw - 2, 3).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(24).fillColor(C.navy);
      text(val ?? 0, x, y + 16, { width: cw, align: 'center' });
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
      text(label.toUpperCase(), x, y + 48, { width: cw, align: 'center' });
    });
    y += ch + 22;
  }

  // ---------- priority breakdown (label + proportional bar + count) ----------
  function priority() {
    if (!priorityBreakdown.length) return;
    section('Priority Case Breakdown', 40);
    const max = Math.max(...priorityBreakdown.map(p => p.n), 1);
    const labelW = 150, barX = PAGE.m + labelW + 8, barW = W - labelW - 8 - 40;
    priorityBreakdown.forEach(p => {
      ensure(22);
      doc.font('Helvetica').fontSize(9.5).fillColor(C.text);
      text(p.case_type, PAGE.m, y + 3, { width: labelW });
      doc.roundedRect(barX, y + 3, barW, 10, 5).fill(C.greyBg);
      doc.roundedRect(barX, y + 3, Math.max(10, (barW * p.n) / max), 10, 5).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy);
      text(p.n, PAGE.m + W - 32, y + 3, { width: 32, align: 'right' });
      y += 21;
    });
    y += 14;
  }

  // ---------- evacuation centers table ----------
  function centersTable() {
    section('Evacuation Centers', 70);
    const cols = [
      { k: 'name', t: 'CENTER', w: 205, a: 'left' }, { k: 'brgy', t: 'BARANGAY', w: 105, a: 'left' },
      { k: 'occ', t: 'OCCUPANCY', w: 110, a: 'left' }, { k: 'status', t: 'STATUS', w: W - 420, a: 'left' }
    ];
    const px = 8;
    let xs = []; cols.reduce((x, c) => { xs.push(x); return x + c.w; }, PAGE.m);

    const header = () => {
      doc.rect(PAGE.m, y, W, 22).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white);
      cols.forEach((c, i) => text(c.t, xs[i] + px, y + 7, { width: c.w - px * 2, align: c.a }));
      y += 22;
    };

    if (!centers.length) {
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted); text('No evacuation centers on record.', PAGE.m, y); y += 24; return;
    }
    ensure(22 + 30); header();

    let sumOcc = 0, sumCap = 0;
    centers.forEach((c, idx) => {
      sumOcc += c.occupancy || 0; sumCap += c.capacity || 0;
      const rh = Math.max(h(c.center_name, cols[0].w - px * 2, 'Helvetica', 9.5), h(c.barangay, cols[1].w - px * 2, 'Helvetica', 9.5), 14) + 12;
      if (ensure(rh)) header();
      if (idx % 2 === 0) doc.rect(PAGE.m, y, W, rh).fill(C.soft);
      doc.font('Helvetica').fontSize(9.5).fillColor(C.text);
      doc.text(c.center_name, xs[0] + px, y + 6, { width: cols[0].w - px * 2 });
      doc.text(c.barangay || '—', xs[1] + px, y + 6, { width: cols[1].w - px * 2 });
      doc.font('Helvetica-Bold').fillColor(C.navy);
      text(`${c.occupancy} / ${c.capacity}`, xs[2] + px, y + 6, { width: 56 });
      // mini occupancy bar
      const pct = c.capacity > 0 ? Math.min(1, c.occupancy / c.capacity) : 0;
      doc.roundedRect(xs[2] + px + 58, y + 9, 36, 5, 2.5).fill(C.greyBg);
      if (pct > 0) doc.roundedRect(xs[2] + px + 58, y + 9, Math.max(5, 36 * pct), 5, 2.5).fill(pct >= 1 ? C.bad : C.accent);
      chip(c.status, xs[3] + px, y + (rh - 16) / 2);
      y += rh;
    });

    // totals row
    if (ensure(26)) header();
    doc.rect(PAGE.m, y, W, 24).fill(C.accentBg);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy);
    text('TOTAL', xs[0] + px, y + 7);
    text(`${sumOcc} / ${sumCap}`, xs[2] + px, y + 7, { width: 90 });
    y += 24 + 22;
  }

  // ---------- field remarks (manually wrapped so it can span pages cleanly) ----------
  function wrap(str, width, font, size) {
    doc.font(font).fontSize(size);
    const lines = [];
    String(str).split(/\r?\n/).forEach(par => {
      if (!par.trim()) { lines.push(''); return; }
      let line = '';
      par.split(/\s+/).forEach(word => {
        // hard-split a single word that is wider than the column
        while (doc.widthOfString(word) > width) {
          let cut = word.length - 1;
          while (cut > 1 && doc.widthOfString(word.slice(0, cut)) > width) cut--;
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0, cut)); word = word.slice(cut);
        }
        const test = line ? `${line} ${word}` : word;
        if (doc.widthOfString(test) <= width) line = test;
        else { lines.push(line); line = word; }
      });
      lines.push(line);
    });
    return lines;
  }

  function remarks() {
    if (!report.field_remarks || !String(report.field_remarks).trim()) return;
    section('Field Remarks', 50);
    const lh = 14, width = W - 20;
    const lines = wrap(report.field_remarks, width, 'Helvetica', 10);
    let i = 0;
    while (i < lines.length) {
      if (y + lh > BOTTOM) newPage();
      const fit = Math.max(1, Math.floor((BOTTOM - y) / lh));
      const chunk = lines.slice(i, i + fit);
      const boxH = chunk.length * lh + 14;
      doc.roundedRect(PAGE.m, y, W, boxH, 6).lineWidth(0.8).fillAndStroke(C.soft, C.line);
      doc.rect(PAGE.m, y + 4, 3, boxH - 8).fill(C.accent);
      doc.font('Helvetica').fontSize(10).fillColor(C.text);
      chunk.forEach((l, k) => text(l, PAGE.m + 14, y + 7 + k * lh, { width }));
      y += boxH + 8;
      i += chunk.length;
    }
    y += 10;
  }

  // ---------- prepared-by / signature block ----------
  function signatures() {
    const bh = 70;
    ensure(bh + 10);
    y += 6;
    const sw = (W - 40) / 2;
    [['Prepared by', author], ['Noted by (MDRRMO Head)', '']].forEach(([role, name], i) => {
      const x = PAGE.m + i * (sw + 40);
      doc.moveTo(x, y + 36).lineTo(x + sw, y + 36).lineWidth(0.8).strokeColor(C.muted).stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy);
      text(name, x, y + 41, { width: sw, align: 'center' });
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted);
      text(role, x, y + 55, { width: sw, align: 'center' });
    });
    y += bh;
  }

  // ---------- compose ----------
  firstHeader();
  detailsPanel();
  statCards();
  priority();
  centersTable();
  remarks();
  signatures();

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;           // otherwise writing in the bottom margin spawns a new page
    const fy = PAGE.h - 38;
    doc.moveTo(PAGE.m, fy - 8).lineTo(PAGE.m + W, fy - 8).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
    text('RESCOM · MDRRMO San Nicolas, Ilocos Norte', PAGE.m, fy, { width: W / 3, align: 'left' });
    text(`Report ${reportNo} · Generated ${fmt(new Date())}`, PAGE.m + W / 3, fy, { width: W / 3, align: 'center' });
    text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.m + (W * 2) / 3, fy, { width: W / 3, align: 'right' });
  }

  doc.end();
}

module.exports = { buildDromicPdf };
