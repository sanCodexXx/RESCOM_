import React, { useEffect, useState } from 'react';
import { Plus, FileBarChart, Users, Building2, ShieldAlert, Download, Lock, Info } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextArea, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

// Database values stay Draft / Active / Finalized; these are the names people see.
const STATUS_LABEL = { Draft: 'Draft', Active: 'On-Going', Finalized: 'Final' };

const fmtAsOf = (d) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: '2-digit', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function DromicReports() {
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [reports, setReports] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [r, i] = await Promise.all([api.get('/dromic'), api.get('/incidents')]);
      setReports(r); setIncidents(i);
    } catch (e) { toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('dromic_report_generated', handler);
    return () => s.off('dromic_report_generated', handler);
  }, []);

  function generateModal() {
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
          try { const r = await api.post('/dromic', form); closeModal(); toast(`DROMIC Report #${r.report_no} generated`, 'ok'); load(); }
          catch (e) { toast(e.message, 'bad'); }
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
            <p className="text-[11px] text-navy-900/45 mt-4">The PDF follows the DSWD DROMIC layout: Situation Overview, Affected Population, Displaced Population and Profile.</p>
          </div>
        ),
        footer: <>
          <Button variant="ghost" block onClick={closeModal}>Close</Button>
          <Button block onClick={() => downloadPdf(r)}><Download size={14} />Download PDF</Button>
        </>
      });
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function downloadPdf(r) {
    try {
      const blob = await api.download(`/dromic/${r.report_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `DROMIC-Report-${r.report_no || r.report_id}-${(r.disaster_name || 'incident').replace(/[^\w-]+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function setStatus(r, status) {
    try { await api.patch(`/dromic/${r.report_id}/status`, { reporting_status: status }); toast(`Report #${r.report_no} is now ${STATUS_LABEL[status]}`, 'ok'); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  function finalize(r) {
    openConfirm({
      title: `Finalize Report #${r.report_no}?`,
      msg: `This makes it the <b>final report</b> for ${r.disaster_name || 'this incident'}. A final report is locked, and no new reports can be generated for this incident afterwards.`,
      onConfirm: () => setStatus(r, 'Finalized')
    });
  }

  return (
    <>
      <PageHeader title="DROMIC Reports" subtitle="Disaster Response Operations Monitoring and Information Center reports"
        actions={<Button onClick={generateModal}><Plus size={14} />Generate Report</Button>} />

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
                    <Button size="sm" variant="ghost" onClick={() => downloadPdf(r)}><Download size={13} />PDF</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !reports.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No DROMIC reports generated yet.</p>}
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