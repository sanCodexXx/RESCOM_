import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Building2, Download, FileBarChart, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { PageHeader } from '../components/layout/Shell.jsx';
import { Pagination, Skeleton, LoadError, EmptyState } from '../components/ui/DataStates.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextArea, Select } from '../components/ui/Field.jsx';
import { api, savedMessage } from '../lib/api.js';
import { isLocalId } from '../lib/fieldData.js';
import { forgetCachedReport, resolveFieldId, subscribeSync, syncStatus } from '../lib/sync.js';
import { useSyncRefresh } from '../lib/useSyncRefresh.js';
import { getSocket } from '../lib/socket.js';

const STATUS_LABEL = { Draft: 'Draft', Active: 'Issued', Finalized: 'Final' };
const fmtAsOf = (d) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: '2-digit', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

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

export default function DromicReports({ ctx, onNav }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN_STAFF';
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const { reachable, needsSignIn } = useSyncExternalStore(subscribeSync, syncStatus);
  const [reports, setReports] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadId = useRef(0);

  const loadReports = useCallback(async () => {
    const id = ++loadId.current;
    setListLoading(true);
    setLoadError('');
    try {
      const [savedReports, currentIncidents] = await Promise.all([api.get('/dromic'), api.get('/incidents')]);
      if (id !== loadId.current) return;
      setReports(savedReports);
      setIncidents(currentIncidents);
    } catch (error) {
      if (id === loadId.current) setLoadError(error.message);
    } finally {
      if (id === loadId.current) setListLoading(false);
    }
  }, []);

  useSyncRefresh(loadReports);
  useEffect(() => {
    loadReports();
    const socket = getSocket();
    const events = ['dromic_report_generated', 'incident_status_changed', 'new_incident_dispatched'];
    events.forEach(event => socket.on(event, loadReports));
    return () => {
      loadId.current++;
      events.forEach(event => socket.off(event, loadReports));
    };
  }, [loadReports]);

  const incidentId = resolveFieldId(ctx?.incidentId);
  const incident = incidents.find(row => String(row.incident_id) === String(incidentId));
  const visibleReports = incidentId == null ? reports : reports.filter(row => String(row.incident_id) === String(incidentId));
  const pager = usePagination(visibleReports, incidentId);

  function newIncidentReport() {
    const finalIds = new Set(reports.filter(row => row.reporting_status === 'Finalized').map(row => String(row.incident_id)));
    const available = (incidentId == null ? incidents : incidents.filter(row => row === incident))
      .filter(row => !finalIds.has(String(row.incident_id)));
    if (!available.length) {
      toast(incident ? 'This incident already has a final report.' : 'Select an incident that has no final report yet.', 'bad');
      return;
    }
    const form = { incident_id: available[0].incident_id, field_remarks: '' };
    openModal({
      title: 'Generate DROMIC Report',
      sub: 'Save a numbered snapshot of evacuation figures for this incident.',
      body: <GenerateForm incidents={available} form={form} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          try {
            const report = await api.post('/dromic', form);
            closeModal();
            toast(savedMessage(report, `DROMIC Report #${report.report_no} generated`), 'ok');
            loadReports();
            if (report.queued) return;
            const source = available.find(row => String(row.incident_id) === String(form.incident_id));
            await downloadPdf({ ...report, disaster_name: source?.disaster_name });
          } catch (error) { toast(error.message, 'bad'); }
        }}><FileBarChart size={14} />Generate</Button>
      </>
    });
  }

  async function viewSummary(r) {
    if (isLocalId(r.report_id)) return;
    try {
      const data = await api.get(`/dromic/${r.report_id}/summary`);
      const t = data.totals || {};
      const snapshot = data.isSnapshot ?? Boolean(data.incident_status);
      openModal({
        title: `DROMIC Report #${r.report_no} on ${r.disaster_name}`,
        sub: `As of ${fmtAsOf(r.as_of || r.report_date)} · ${STATUS_LABEL[r.reporting_status]}`,
        body: (
          <div>
            <p className="text-xs text-slate-500 mb-4">Prepared by {[r.author_first, r.author_last].filter(Boolean).join(' ') || 'MDRRMO staff'} · {r.brgy || 'All barangays'}</p>
            {data.report?.incident_status && <p className="text-xs mb-4">{snapshot ? 'Incident status at reporting time' : 'Current incident status'} <Badge className={STATUS_PILL[data.report.incident_status]}>{data.report.incident_status}</Badge></p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MiniStat icon={<Users size={16} />} label="Persons now" value={t.persons_now} />
              <MiniStat icon={<Users size={16} />} label="Persons (cum)" value={t.persons_cum} />
              <MiniStat icon={<Building2 size={16} />} label="Centers in use" value={t.centers_now} />
              <MiniStat icon={<ShieldAlert size={16} />} label="Vulnerable" value={(data.profile?.vulnerable || []).reduce((a, v) => a + v.n, 0)} />
            </div>
            <b className="text-navy-900 text-[0.8125rem] block mb-2">Inside Evacuation Centers</b>
            <div className="text-[0.6875rem] grid grid-cols-[1fr_auto_auto] gap-x-4 text-navy-900/45 px-1 pb-1"><span>Center</span><span>Families now / cum</span><span>Persons now / cum</span></div>
            {(data.centers || []).map(c => (
              <div key={c.center_id} className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[0.78125rem] py-2 border-b border-navy-900/10 px-1">
                <span className="text-navy-900/80 min-w-0 truncate">{c.center_name}</span>
                <span className="text-navy-900/60 text-right">{c.families_now} / {c.families_cum}</span>
                <span className="text-navy-900/60 text-right">{c.persons_now} / {c.persons_cum}</span>
              </div>
            ))}
            {!data.centers?.length && <p className="text-navy-900/45 text-[0.78125rem]">No evacuees registered under this incident yet.</p>}
            <b className="text-navy-900 text-[0.8125rem] block mt-4 mb-2">Affected, by Barangay of Origin</b>
            {(data.byOrigin || []).map(b => (
              <div key={b.barangay} className="flex justify-between text-[0.78125rem] py-1.5 border-b border-navy-900/10 px-1">
                <span className="text-navy-900/80">{b.barangay}</span>
                <span className="text-navy-900/55">{b.families} fam · {b.persons} persons</span>
              </div>
            ))}
            {r.field_remarks && (
              <div className="mt-4">
                <b className="text-navy-900 text-[0.8125rem] block mb-1.5">Field Remarks</b>
                <p className="text-navy-900/65 text-[0.78125rem] leading-relaxed">{r.field_remarks}</p>
              </div>
            )}
            <p className="text-[0.6875rem] text-navy-900/45 mt-4">{snapshot ? 'Figures were saved at the report’s as-of time.' : 'This earlier report uses current figures.'}</p>
          </div>
        ),
        footer: <>
          <Button variant="ghost" block onClick={closeModal}>Close</Button>
          {isAdmin && r.reporting_status === 'Draft' && <Button variant="ghost" onClick={() => { closeModal(); setStatus(r, 'Active'); }}>Issue</Button>}
          {isAdmin && r.reporting_status === 'Active' && <Button variant="ghost" onClick={() => { closeModal(); finalize(r); }}>Finalize</Button>}
          <Button block disabled={isLocalId(r.report_id)} onClick={() => downloadPdf(r)}><Download size={14} />Download PDF</Button>
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

  async function setStatus(r, status) {
    try {
      const result = await api.patch(`/dromic/${r.report_id}/status`, { reporting_status: status });
      toast(savedMessage(result, `Report #${r.report_no} is now ${STATUS_LABEL[status]}`), 'ok');
      loadReports();
    }
    catch (e) { toast(e.message, 'bad'); }
  }
  function finalize(r) {
    openConfirm({
      title: `Finalize Report #${r.report_no}?`,
      msg: `This makes it the <b>final report</b> for the incident and locks it against further changes.`,
      onConfirm: () => setStatus(r, 'Finalized')
    });
  }

  function removeReport(report) {
    openConfirm({
      title: `Delete DROMIC Report #${report.report_no ?? report.report_id}?`,
      msg: 'This removes the report from the list. The disaster incident stays in RESCOM.',
      confirmLabel: 'Delete report',
      onConfirm: async () => {
        await api.del(`/dromic/${report.report_id}`);
        await forgetCachedReport(report.report_id).catch(() => {});
        setReports(rows => rows.filter(row => row.report_id !== report.report_id));
        toast('Report deleted', 'ok');
        await loadReports();
      }
    });
  }

  const actions = {
    isAdmin, canDelete: reachable && !needsSignIn, onView: viewSummary, onDownload: downloadPdf, onRemove: removeReport
  };
  const reportNumber = report => isLocalId(report.report_id) ? 'Pending sync' : `#${report.report_no ?? report.report_id}`;

  return (
    <>
      <PageHeader title="DROMIC Reports" subtitle="Numbered reports for disaster incidents"
        actions={<Button onClick={newIncidentReport} disabled={listLoading || !incidents.length}><Plus size={14} />New incident report</Button>} />
      {incidentId != null && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-navy-900">{incident?.disaster_name || 'Selected incident'}</h2>
          {incident && <span className="flex items-center gap-2 text-xs text-navy-900/60">Incident status <Badge className={STATUS_PILL[incident.reporting_status]}>{incident.reporting_status}</Badge></span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => onNav('dromic')}>All reports</Button>
      </div>}
      <LoadError message={loadError} onRetry={loadReports} />
      {listLoading && <Skeleton label="Loading reports" />}
      {pager.total > 0 && <>
        <div className="hidden md:block glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>{['Report No.', 'Incident', 'As of', 'Report status', 'Actions'].map(label => (
                <th key={label} scope="col" className="text-left text-[0.6875rem] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pager.items.map(report => (
                <tr key={report.report_id} className="border-b border-navy-900/8">
                  <td className="px-4 py-3 text-[0.78125rem] font-bold text-navy-900">{reportNumber(report)}</td>
                  <td className="px-4 py-3 text-[0.78125rem] font-bold text-navy-900">{report.disaster_name || '—'}</td>
                  <td className="px-4 py-3 text-[0.75rem] text-navy-900/55">{fmtAsOf(report.as_of || report.report_date)}</td>
                  <td className="px-4 py-3"><ReportStatus report={report} /></td>
                  <td className="px-4 py-3"><ReportActions report={report} {...actions} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {pager.items.map(report => <article key={report.report_id} className="glass rounded-glass p-4 space-y-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{reportNumber(report)}</span><ReportStatus report={report} /></div>
            <h3 className="font-semibold text-sm break-words">{report.disaster_name || 'Incident report'}</h3>
            <p className="text-xs text-slate-500">As of {fmtAsOf(report.as_of || report.report_date)}</p>
            <ReportActions report={report} {...actions} />
          </article>)}
        </div>
        <Pagination pager={pager} />
      </>}
      {!listLoading && !loadError && !pager.total && <EmptyState title="No DROMIC reports yet" message={incident ? 'Generate a numbered report for this incident.' : 'Generate a report after logging a disaster incident.'} />}
    </>
  );
}

function ReportStatus({ report }) {
  return <Badge className={STATUS_PILL[report.reporting_status]}>{STATUS_LABEL[report.reporting_status]}</Badge>;
}

function ReportActions({ report, isAdmin, canDelete, onView, onDownload, onRemove }) {
  const local = isLocalId(report.report_id);
  const deleteLabel = `Delete report #${report.report_no ?? report.report_id}`;
  return <div className="flex flex-wrap gap-1.5 items-center">
    <Button size="sm" variant="ghost" disabled={local} onClick={() => onView(report)}>View report</Button>
    <Button size="sm" disabled={local} onClick={() => onDownload(report)}><Download size={14} aria-hidden="true" />PDF</Button>
    {isAdmin && !local && report.reporting_status !== 'Finalized' && (
      <Button size="sm" variant="ghost" disabled={!canDelete || report.pending_sync} aria-label={deleteLabel} title={canDelete ? deleteLabel : 'Connect to RESCOM to delete reports'} onClick={() => onRemove(report)}>
        <Trash2 size={15} aria-hidden="true" />
      </Button>
    )}
  </div>;
}

function GenerateForm({ incidents, form }) {
  const [incidentId, setIncidentId] = useState(String(form.incident_id));
  return (
    <>
      <Field label="Disaster Incident" required>
        <Ctrl><Select value={incidentId} onChange={e => { setIncidentId(e.target.value); form.incident_id = e.target.value; }}>
          {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.disaster_name} — {i.brgy || 'San Nicolas'}</option>)}
        </Select></Ctrl>
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
      <div className="text-[1.25rem] font-bold text-navy-900">{value ?? 0}</div>
      <div className="text-[0.65625rem] text-navy-900/45">{label}</div>
    </div>
  );
}
