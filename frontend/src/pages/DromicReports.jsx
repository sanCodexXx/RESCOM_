import React, { useEffect, useRef, useState } from 'react';
import { Plus, FileBarChart, Users, Building2, ShieldAlert, Download, Lock, FileSpreadsheet, Activity, CheckCircle, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextArea, TextInput, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { BARANGAYS } from '../lib/barangays.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';
import { downloadDromicExcel } from '../lib/dromicExcel.js';

// Database values stay Draft / Active / Finalized; these are the names people see.
const STATUS_LABEL = { Draft: 'Draft', Active: 'On-Going', Finalized: 'Final' };
const fmtAsOf = (d) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: '2-digit', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const PERIODS = [
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom range' }
];
const BAR = '#4F6FE8';
const PEAK = '#1B1464';
const PALETTE = ['#4F6FE8', '#F59E0B', '#EF4444', '#16A34A', '#94A3B8', '#8B5CF6', '#0EA5E9', '#DB2777', '#64748B'];
const dateInput = 'rounded-xl border border-navy-900/15 bg-white px-3 py-2 text-[13px] text-navy-900';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Start and end dates (YYYY-MM-DD) of the period picked in the filter bar.
function periodRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (key === 'quarter') {
    const q = Math.floor(m / 3) * 3;
    return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
  }
  if (key === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return null;
}

function fmtDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The barangay list is stored as "Barangay 1 - San Francisco (Pob.)"; charts show just "Barangay 1".
const shortName = (n) => String(n).split(' - ')[0];

function pctChange(cur, prev) {
  if (prev == null) return null;
  if (prev === 0) return cur > 0 ? 'new' : null;
  return Math.round(((cur - prev) / prev) * 100);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Saves a chart (the SVG recharts draws) as a PNG.
function savePng(container, filename) {
  const svg = container && container.querySelector('svg');
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => { if (blob) saveBlob(blob, filename); }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

export default function DromicReports() {
  const { toast, openModal, closeModal, openConfirm } = useUi();

  // Dashboard filters
  const [period, setPeriod] = useState('quarter');
  const [custom, setCustom] = useState(() => periodRange('quarter'));
  const [brgy, setBrgy] = useState('');
  const [from, to] = period === 'custom' ? custom : periodRange(period);
  const invalid = !from || !to || from > to;

  // Dashboard data (live from the database)
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Per-incident DROMIC reports
  const [reports, setReports] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  async function loadOverview() {
    if (invalid) { setOverview(null); setOverviewLoading(false); return; }
    setOverviewLoading(true);
    try {
      const qs = new URLSearchParams({ from, to, ...(brgy ? { brgy } : {}) });
      setOverview(await api.get(`/analytics/overview?${qs}`));
    } catch (e) { toast(e.message, 'bad'); }
    finally { setOverviewLoading(false); }
  }
  // Socket handlers run with whatever filters were current when they were attached, so they call through a ref.
  const overviewRef = useRef(loadOverview);
  overviewRef.current = loadOverview;

  async function loadReports() {
    try {
      const [r, i] = await Promise.all([api.get('/dromic'), api.get('/incidents')]);
      setReports(r); setIncidents(i);
    } catch (e) { toast(e.message, 'bad'); }
    finally { setListLoading(false); }
  }

  useEffect(() => { loadOverview(); }, [from, to, brgy]);

  useEffect(() => {
    loadReports();
    const s = getSocket();
    const refresh = () => { loadReports(); overviewRef.current(); };
    const events = ['dromic_report_generated', 'evacuee_registered', 'incident_status_changed', 'new_incident_dispatched'];
    events.forEach(e => s.on(e, refresh));
    return () => events.forEach(e => s.off(e, refresh));
  }, []);

  // ---------- period report (the Generate Report button) ----------

  function openPeriodReport() {
    const form = { type: 'monthly', from, to, format: 'pdf', brgy };
    openModal({
      title: 'Generate Report',
      sub: 'Export a situational report for submission',
      body: <PeriodReportForm form={form} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={() => runPeriodExport(form)}><Download size={14} />Generate</Button>
      </>
    });
  }

  async function runPeriodExport(form) {
    if (!form.from || !form.to || form.from > form.to) { toast('Check the From and To dates', 'bad'); return; }
    try {
      const qs = new URLSearchParams({
        type: form.type, from: form.from, to: form.to, format: form.format,
        ...(form.brgy ? { brgy: form.brgy } : {})
      });
      const blob = await api.download(`/analytics/export?${qs}`);
      const ext = form.format === 'xlsx' ? 'xlsx' : form.format;
      saveBlob(blob, `Situational-Report-${form.from}-to-${form.to}.${ext}`);
      closeModal();
      toast('Report downloaded', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  // ---------- per-incident DROMIC reports (numbered, Draft / Active / Final) ----------

  function newIncidentReport() {
    const finalIds = new Set(reports.filter(r => r.reporting_status === 'Finalized').map(r => r.incident_id));
    const open = incidents.filter(i => !finalIds.has(i.incident_id));
    if (!open.length) { toast('Every incident already has a final report. Log a new incident first.', 'bad'); return; }
    const form = { incident_id: open[0].incident_id, field_remarks: '' };
    openModal({
      title: 'Generate DROMIC Report',
      sub: 'Creates the next numbered report for an incident, with the figures as of right now',
      body: <GenerateForm incidents={open} reports={reports} form={form} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          if (!form.incident_id) { toast('Select a disaster incident', 'bad'); return; }
          try {
            const r = await api.post('/dromic', form); closeModal(); toast(`DROMIC Report #${r.report_no} generated`, 'ok'); loadReports();
            // Open the same figures in the DSWD Excel template right away.
            const inc = incidents.find(i => String(i.incident_id) === String(form.incident_id));
            await downloadExcel({ ...r, disaster_name: inc?.disaster_name });
          } catch (e) { toast(e.message, 'bad'); }
        }}><FileBarChart size={14} />Generate</Button>
      </>
    });
  }

  async function viewSummary(r) {
    try {
      const data = await api.get(`/dromic/${r.report_id}/summary`);
      const t = data.totals || {};
      openModal({
        title: `DROMIC Report #${r.report_no} on ${r.disaster_name}`,
        sub: `as of ${fmtAsOf(r.as_of || r.report_date)} · ${STATUS_LABEL[r.reporting_status]}`,
        body: (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MiniStat icon={<Users size={16} />} label="Persons now" value={t.persons_now} />
              <MiniStat icon={<Users size={16} />} label="Persons (cum)" value={t.persons_cum} />
              <MiniStat icon={<Building2 size={16} />} label="Centers in use" value={t.centers_now} />
              <MiniStat icon={<ShieldAlert size={16} />} label="Vulnerable" value={(data.profile?.vulnerable || []).reduce((a, v) => a + v.n, 0)} />
            </div>
            <b className="text-navy-900 text-[13px] block mb-2">Inside Evacuation Centers</b>
            <div className="text-[11px] grid grid-cols-[1fr_auto_auto] gap-x-4 text-navy-900/45 px-1 pb-1"><span>Center</span><span>Families now / cum</span><span>Persons now / cum</span></div>
            {(data.centers || []).map(c => (
              <div key={c.center_id} className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[12.5px] py-2 border-b border-navy-900/10 px-1">
                <span className="text-navy-900/80 min-w-0 truncate">{c.center_name}</span>
                <span className="text-navy-900/60 text-right">{c.families_now} / {c.families_cum}</span>
                <span className="text-navy-900/60 text-right">{c.persons_now} / {c.persons_cum}</span>
              </div>
            ))}
            {!data.centers?.length && <p className="text-navy-900/45 text-[12.5px]">No evacuees registered under this incident yet.</p>}
            <b className="text-navy-900 text-[13px] block mt-4 mb-2">Affected, by Barangay of Origin</b>
            {(data.byOrigin || []).map(b => (
              <div key={b.barangay} className="flex justify-between text-[12.5px] py-1.5 border-b border-navy-900/10 px-1">
                <span className="text-navy-900/80">{b.barangay}</span>
                <span className="text-navy-900/55">{b.families} fam · {b.persons} persons</span>
              </div>
            ))}
            {r.field_remarks && (
              <div className="mt-4">
                <b className="text-navy-900 text-[13px] block mb-1.5">Field Remarks</b>
                <p className="text-navy-900/65 text-[12.5px] leading-relaxed">{r.field_remarks}</p>
              </div>
            )}
            <p className="text-[11px] text-navy-900/45 mt-4">The Excel file is the official DSWD DROMIC template, filled in and ready to edit. The PDF follows the same DROMIC layout.</p>
          </div>
        ),
        footer: <>
          <Button variant="ghost" block onClick={closeModal}>Close</Button>
          <Button variant="ghost" block onClick={() => downloadPdf(r)}><Download size={14} />PDF</Button>
          <Button block onClick={() => downloadExcel(r)}><FileSpreadsheet size={14} />Download Excel</Button>
        </>
      });
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function downloadPdf(r) {
    try {
      const blob = await api.download(`/dromic/${r.report_id}/pdf`);
      saveBlob(blob, `DROMIC-Report-${r.report_no || r.report_id}-${(r.disaster_name || 'incident').replace(/[^\w-]+/g, '_')}.pdf`);
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function downloadExcel(r) {
    try { await downloadDromicExcel(r); toast('Excel report downloaded. Open it in Excel to edit.', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function setStatus(r, status) {
    try { await api.patch(`/dromic/${r.report_id}/status`, { reporting_status: status }); toast(`Report #${r.report_no} is now ${STATUS_LABEL[status]}`, 'ok'); loadReports(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  function finalize(r) {
    openConfirm({
      title: `Finalize Report #${r.report_no}?`,
      msg: `This makes it the <b>final report</b> for ${r.disaster_name || 'this incident'}. A final report is locked, and no new reports can be generated for this incident afterwards.`,
      onConfirm: () => setStatus(r, 'Finalized')
    });
  }

  const k = overview?.kpis;

  return (
    <>
      <PageHeader
        title="DROMIC Reports"
        subtitle="Trends, performance metrics and downloadable reports"
        actions={<Button onClick={openPeriodReport}><Download size={14} />Generate Report</Button>}
      />

      {/* Filters */}
      <div className="glass rounded-glass shadow-glass-sm p-3 mb-2 flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold border transition ${period === p.key ? 'bg-accent-600 text-white border-transparent' : 'bg-white text-navy-900/75 border-navy-900/15 hover:bg-navy-900/5'}`}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={custom[0]} onChange={e => setCustom([e.target.value, custom[1]])} className={dateInput} />
            <span className="text-navy-900/40 text-[13px]">to</span>
            <input type="date" value={custom[1]} onChange={e => setCustom([custom[0], e.target.value])} className={dateInput} />
          </div>
        )}
        <select value={brgy} onChange={e => setBrgy(e.target.value)} className={`ml-auto ${dateInput}`}>
          <option value="">All barangays</option>
          {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <p className="text-[12px] text-navy-900/55 mb-4">
        {invalid
          ? 'Choose a From date on or before the To date.'
          : `Showing ${fmtDay(from)} – ${fmtDay(to)}${overview ? `, compared with ${fmtDay(overview.period.prevFrom)} – ${fmtDay(overview.period.prevTo)}` : ''}.`}
      </p>

      {!invalid && overviewLoading && !overview && <p className="text-navy-900/45 text-[12.5px] mb-4">Loading analytics…</p>}

      {!invalid && overview && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <KpiCard tone="red" icon={<AlertTriangle size={20} />} label="Total Incidents" value={k.incidents.value}>
              <CountDelta cur={k.incidents.value} prev={k.incidents.prev} />
            </KpiCard>
            <KpiCard tone="blue" icon={<Users size={20} />} label="Evacuees Served" value={k.evacuees.value.toLocaleString()}>
              <CountDelta cur={k.evacuees.value} prev={k.evacuees.prev} />
            </KpiCard>
            <KpiCard tone="green" icon={<Activity size={20} />} label="Avg. Response Time" value={k.responseMinutes.value == null ? '—' : `${Math.round(k.responseMinutes.value)} min`}>
              <ResponseDelta cur={k.responseMinutes.value} prev={k.responseMinutes.prev} />
              <div className="text-[11px] text-navy-900/45 mt-0.5">Logged to first evacuee registered</div>
            </KpiCard>
            <KpiCard tone="amber" icon={<CheckCircle size={20} />} label="Resolution Rate" value={k.resolution.total ? `${Math.round((k.resolution.resolved / k.resolution.total) * 100)}%` : '—'}>
              <span className="text-navy-900/55">{k.resolution.resolved} of {k.resolution.total} incidents resolved</span>
            </KpiCard>
          </div>

          {/* Incidents: monthly bars + type breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-4">
            <div className="xl:col-span-3"><MonthlyChart data={overview.monthly} /></div>
            <div className="xl:col-span-2"><TypeDonut data={overview.byType} total={k.incidents.value} /></div>
          </div>

          {/* Evacuees: 14-day trend + top barangays */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-4">
            <div className="xl:col-span-3"><TrendChart data={overview.trend14} /></div>
            <div className="xl:col-span-2"><BarangayBars data={overview.topBarangays} /></div>
          </div>
        </>
      )}

      {/* Per-incident DROMIC reports */}
      <div className="flex flex-wrap items-end justify-between gap-3 mt-8 mb-3">
        <div>
          <h2 className="text-[17px] font-bold text-navy-900 m-0">Incident DROMIC Reports</h2>
          <p className="text-[12.5px] text-navy-900/55 mt-0.5">One numbered report per disaster incident, with its own status</p>
        </div>
        <Button onClick={newIncidentReport}><Plus size={14} />New incident report</Button>
      </div>

      <div className="glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>{['Report', 'Disaster', 'Barangay', 'As of', 'Prepared By', 'Status', ''].map(h => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.report_id} className="border-b border-navy-900/8 cursor-pointer hover:bg-navy-900/4" onClick={() => viewSummary(r)}>
                <td className="px-4 py-3 text-[12.5px] text-navy-900"><b>#{r.report_no ?? r.report_id}</b></td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900"><b>{r.disaster_name || '—'}</b></td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{r.brgy || '—'}</td>
                <td className="px-4 py-3 text-[12px] text-navy-900/55">{fmtAsOf(r.as_of || r.report_date)}</td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{r.author_first} {r.author_last}</td>
                <td className="px-4 py-3"><Badge className={STATUS_PILL[r.reporting_status]}>{STATUS_LABEL[r.reporting_status]}</Badge></td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5 items-center">
                    {r.reporting_status === 'Draft' && <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'Active')}>Activate</Button>}
                    {r.reporting_status === 'Active' && <Button size="sm" variant="ghost" onClick={() => finalize(r)}>Finalize</Button>}
                    {r.reporting_status === 'Finalized' && <span className="flex items-center gap-1 text-[11px] text-navy-900/45 px-1"><Lock size={12} />Locked</span>}
                    <Button size="sm" variant="ghost" onClick={() => downloadExcel(r)}><FileSpreadsheet size={13} />Excel</Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadPdf(r)}><Download size={13} />PDF</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!listLoading && !reports.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No DROMIC reports generated yet.</p>}
    </>
  );
}

// ---------- dashboard pieces ----------

const TONES = {
  red: { box: 'bg-danger-bg', fg: 'text-danger' },
  blue: { box: 'bg-accent-50', fg: 'text-accent-700' },
  green: { box: 'bg-success-bg', fg: 'text-success' },
  amber: { box: 'bg-[#FFF4E5]', fg: 'text-[#C2670B]' }
};

function KpiCard({ tone, icon, label, value, children }) {
  const t = TONES[tone];
  return (
    <div className="glass rounded-glass shadow-glass-sm p-5 flex gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.box} ${t.fg}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-[12.5px] font-semibold ${t.fg}`}>{label}</div>
        <div className="text-[28px] font-bold text-navy-900 leading-tight">{value}</div>
        <div className="text-[12px] mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function CountDelta({ cur, prev }) {
  const p = pctChange(cur, prev);
  if (p === null) return <span className="text-navy-900/50">No comparison data</span>;
  if (p === 'new') return <span className="text-navy-900/60">New this period</span>;
  if (p === 0) return <span className="text-navy-900/50">No change vs last period</span>;
  const up = p > 0;
  return (
    <span className="inline-flex items-center gap-1 text-navy-900/60">
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(p)}% vs last period
    </span>
  );
}

// Faster response is an improvement, so it shows green.
function ResponseDelta({ cur, prev }) {
  if (cur == null || prev == null) return <span className="text-navy-900/50">Not enough data to compare</span>;
  const diff = Math.round((prev - cur) * 10) / 10;
  if (diff > 0) return <span className="inline-flex items-center gap-1 text-success"><ArrowDown size={12} />{diff} min improvement</span>;
  if (diff < 0) return <span className="inline-flex items-center gap-1 text-danger"><ArrowUp size={12} />{-diff} min slower</span>;
  return <span className="text-navy-900/50">No change vs last period</span>;
}

function Panel({ title, action, children }) {
  return (
    <div className="glass rounded-glass shadow-glass-sm p-5 h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-bold text-[15px] text-navy-900 m-0">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-navy-900/45 text-[12.5px] py-10 text-center">{children}</p>;
}

function MonthlyChart({ data }) {
  const ref = useRef(null);
  const peak = data.length ? Math.max(...data.map(m => m.incidents)) : 0;
  return (
    <Panel
      title="Incidents Reported"
      action={
        <button type="button" onClick={() => savePng(ref.current, 'incidents-reported.png')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy-900/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy-900/75 hover:bg-navy-900/5">
          <Download size={13} />PNG
        </button>
      }
    >
      {peak === 0 ? <Empty>No incidents logged in this period.</Empty> : (
        <div ref={ref}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9f2" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#0B1A47AA' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#0B1A47AA' }} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
              <Bar dataKey="incidents" name="Incidents" radius={[6, 6, 0, 0]}>
                {data.map((m, i) => <Cell key={i} fill={m.incidents === peak ? PEAK : BAR} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function TypeDonut({ data, total }) {
  return (
    <Panel title="Incidents by Type">
      {!data.length ? <Empty>No incidents in this period.</Empty> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
          <div className="relative h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.map(d => ({ name: d.type, value: d.count }))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                  {data.map((d, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <b className="text-[24px] text-navy-900 leading-none">{total}</b>
              <span className="text-[11.5px] text-navy-900/50 mt-1">reports</span>
            </div>
          </div>
          <ul className="space-y-2.5">
            {data.map((d, i) => (
              <li key={d.type} className="flex items-center gap-2 text-[13px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="flex-1 text-navy-900/80 truncate">{d.type}</span>
                <b className="text-navy-900">{Math.round(d.pct)}%</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function TrendChart({ data }) {
  const hasAny = data.some(d => d.evacuees > 0);
  return (
    <Panel title="Evacuee Trend (last 14 days)">
      {!hasAny ? <Empty>No evacuees registered in the last 14 days.</Empty> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9f2" />
            <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#0B1A47AA' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#0B1A47AA' }} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e1e8f5' }} />
            <Bar dataKey="evacuees" name="Evacuees registered" fill={BAR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

function BarangayBars({ data }) {
  if (!data.length) {
    return <Panel title="Top Affected Barangays"><Empty>No evacuees registered in this period.</Empty></Panel>;
  }
  const max = Math.max(...data.map(b => b.persons), 1);
  return (
    <Panel title="Top Affected Barangays">
      <ul className="space-y-4">
        {data.map(b => (
          <li key={b.barangay}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-navy-900/85 font-semibold truncate" title={b.barangay}>{shortName(b.barangay)}</span>
              <span className="text-navy-900/60 shrink-0">{b.persons} persons · {b.families} families</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-navy-900/8 overflow-hidden">
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${(b.persons / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------- modal forms ----------

function PeriodReportForm({ form }) {
  const [type, setType] = useState(form.type);
  const [from, setFrom] = useState(form.from);
  const [to, setTo] = useState(form.to);
  const [format, setFormat] = useState(form.format);

  // Monthly and quarterly reports fill in their own dates; custom keeps whatever was typed.
  function pickType(t) {
    setType(t); form.type = t;
    if (t !== 'custom') {
      const [a, b] = periodRange(t === 'monthly' ? 'month' : 'quarter');
      setFrom(a); setTo(b); form.from = a; form.to = b;
    }
  }

  return (
    <>
      <Field label="Report Type">
        <Ctrl><Select value={type} onChange={e => pickType(e.target.value)}>
          <option value="monthly">Monthly Situational Report</option>
          <option value="quarterly">Quarterly Situational Report</option>
          <option value="custom">Custom Period Report</option>
        </Select></Ctrl>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required>
          <Ctrl><TextInput type="date" value={from} onChange={e => { setFrom(e.target.value); form.from = e.target.value; }} /></Ctrl>
        </Field>
        <Field label="To" required>
          <Ctrl><TextInput type="date" value={to} onChange={e => { setTo(e.target.value); form.to = e.target.value; }} /></Ctrl>
        </Field>
      </div>
      <Field label="Format">
        <div className="flex gap-2">
          {[['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV']].map(([v, label]) => (
            <button key={v} type="button" onClick={() => { setFormat(v); form.format = v; }}
              className={`px-4 py-2 rounded-xl text-[13px] font-semibold border transition ${format === v ? 'bg-accent-600 text-white border-transparent' : 'bg-white text-navy-900/75 border-navy-900/15'}`}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      <p className="text-[11.5px] text-navy-900/55">
        Covers {form.brgy ? `barangay ${form.brgy}` : 'all barangays'}. The figures are read from the live records when you generate the file.
      </p>
    </>
  );
}

function GenerateForm({ incidents, reports, form }) {
  const [incidentId, setIncidentId] = useState(String(form.incident_id));
  const next = (reports.filter(r => String(r.incident_id) === incidentId).reduce((m, r) => Math.max(m, r.report_no || 0), 0)) + 1;
  return (
    <>
      <Field label="Disaster Incident" required>
        <Ctrl><Select value={incidentId} onChange={e => { setIncidentId(e.target.value); form.incident_id = e.target.value; }}>
          {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.disaster_name} — {i.brgy || 'San Nicolas'}</option>)}
        </Select></Ctrl>
        <p className="text-[11.5px] text-navy-900/55 mt-1.5">This will be <b>DROMIC Report #{next}</b> for the selected incident.</p>
      </Field>
      <Field label="Field Remarks (optional)">
        <Ctrl><TextArea placeholder="Relief distribution status, ongoing needs, notes for the record…" onChange={e => (form.field_remarks = e.target.value)} /></Ctrl>
      </Field>
    </>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <div className="glass rounded-xl p-3.5 text-center">
      <div className="text-accent-400 flex justify-center mb-1.5">{icon}</div>
      <div className="text-[20px] font-bold text-navy-900">{value ?? 0}</div>
      <div className="text-[10.5px] text-navy-900/45">{label}</div>
    </div>
  );
}