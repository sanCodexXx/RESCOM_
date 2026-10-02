import React, { useEffect, useState } from 'react';
import { Plus, FileBarChart, Users, Building2, ShieldAlert, Download } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Field, Ctrl, TextArea, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

export default function DromicReports() {
  const { toast, openModal, closeModal } = useUi();
  const [reports, setReports] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

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
    let form = { incident_id: incidents[0]?.incident_id || '', field_remarks: '' };
    openModal({
      title: 'Generate DROMIC Report',
      sub: 'Compiles current figures for a disaster incident into an official report',
      body: (
        <>
          <Field label="Disaster Incident">
            <Ctrl><Select defaultValue={form.incident_id} onChange={e => (form.incident_id = e.target.value)}>
              {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.disaster_name} — {i.brgy}</option>)}
            </Select></Ctrl>
          </Field>
          <Field label="Field Remarks">
            <Ctrl><TextArea placeholder="Relief distribution status, ongoing needs, notes for the record…" onChange={e => (form.field_remarks = e.target.value)} /></Ctrl>
          </Field>
        </>
      ),
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          if (!form.incident_id) { toast('Select a disaster incident', 'bad'); return; }
          try { await api.post('/dromic', form); closeModal(); toast('DROMIC report generated', 'ok'); load(); }
          catch (e) { toast(e.message, 'bad'); }
        }}><FileBarChart size={14} />Generate</Button>
      </>
    });
  }

  async function viewSummary(r) {
    try {
      const data = await api.get(`/dromic/${r.report_id}/summary`);
      setSummary(data);
      openModal({
        title: 'DROMIC Report Summary',
        sub: `${r.disaster_name} · Generated ${new Date(r.report_date).toLocaleString()}`,
        body: (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <MiniStat icon={<Users size={16} />} label="Evacuated" value={data.totals.total_evacuated} />
              <MiniStat icon={<ShieldAlert size={16} />} label="Priority Cases" value={data.totals.priority_count} />
              <MiniStat icon={<Building2 size={16} />} label="Centers" value={data.centers.length} />
            </div>
            <b className="text-navy-900 text-[13px] block mb-2">Centers Involved</b>
            {data.centers.map(c => (
              <div key={c.center_id} className="flex justify-between text-[12.5px] py-2 border-b border-navy-900/10">
                <span className="text-navy-900/70">{c.center_name}</span>
                <span className="text-navy-900/45">{c.occupancy} / {c.capacity}</span>
              </div>
            ))}
            {r.field_remarks && (
              <div className="mt-4">
                <b className="text-navy-900 text-[13px] block mb-1.5">Field Remarks</b>
                <p className="text-navy-900/65 text-[12.5px] leading-relaxed">{r.field_remarks}</p>
              </div>
            )}
          </div>
        ),
        footer: <>
          <Button variant="ghost" block onClick={closeModal}>Close</Button>
          <Button block onClick={() => downloadPdf(r)}><Download size={14} />Download PDF</Button>
        </>
      });
    } catch (e) { toast(e.message, 'bad'); }
  }

  // Downloads the A4 PDF (auth header required, so it's fetched as a blob
  // rather than opened as a plain link) and triggers the browser's save dialog.
  async function downloadPdf(r) {
    try {
      const blob = await api.download(`/dromic/${r.report_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `DROMIC-Report-${r.report_id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function setStatus(r, status) {
    try { await api.patch(`/dromic/${r.report_id}/status`, { reporting_status: status }); toast('Report ' + status.toLowerCase(), 'ok'); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title="DROMIC Reports" subtitle="Disaster Response Operations Monitoring and Information Center reports"
        actions={<Button onClick={generateModal}><Plus size={14} />Generate Report</Button>} />

      <div className="glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>{['Disaster', 'Barangay', 'Generated By', 'Date', 'Status', ''].map(h => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.report_id} className="border-b border-navy-900/8 cursor-pointer hover:bg-navy-900/4" onClick={() => viewSummary(r)}>
                <td className="px-4 py-3 text-[12.5px] text-navy-900"><b>{r.disaster_name || '—'}</b></td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{r.brgy || '—'}</td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{r.author_first} {r.author_last}</td>
                <td className="px-4 py-3 text-[12px] text-navy-900/45">{new Date(r.report_date).toLocaleString()}</td>
                <td className="px-4 py-3"><Badge className={STATUS_PILL[r.reporting_status]}>{r.reporting_status}</Badge></td>
                <td className="px-4 py-3 flex gap-1.5" onClick={e => e.stopPropagation()}>
                  {r.reporting_status !== 'Finalized' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r, r.reporting_status === 'Draft' ? 'Active' : 'Finalized')}>
                      {r.reporting_status === 'Draft' ? 'Activate' : 'Finalize'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(r)}><Download size={13} />PDF</Button>
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

function MiniStat({ icon, label, value }) {
  return (
    <div className="glass rounded-xl p-3.5 text-center">
      <div className="text-accent-400 flex justify-center mb-1.5">{icon}</div>
      <div className="text-[20px] font-bold text-navy-900">{value}</div>
      <div className="text-[10.5px] text-navy-900/45">{label}</div>
    </div>
  );
}
