import { useAuth } from '../context/AuthContext.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { Pagination, Skeleton, LoadError, EmptyState as SharedEmptyState } from '../components/ui/DataStates.jsx';
import React, { useEffect, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL, SEV_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextInput, TextArea, Select } from '../components/ui/Field.jsx';
import { api, savedMessage } from '../lib/api.js';
import { useSyncRefresh } from '../lib/useSyncRefresh.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

const STATUSES = ['Pending', 'En Route', 'Active', 'Resolved'];

export default function Incidents({ ctx, onNav }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN_STAFF';
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => { if (ctx?.quickAction === 'incident') newModal(); }, [ctx]);

  const pager = usePagination(incidents, '');

  async function load() {
    setLoadError('');
    setLoading(true);
    try { setIncidents(await api.get('/incidents')); }
    catch (e) { setLoadError(e.message); toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }

  useSyncRefresh(load);

  useEffect(() => {
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('new_incident_dispatched', handler);
    s.on('incident_status_changed', handler);
    return () => { s.off('new_incident_dispatched', handler); s.off('incident_status_changed', handler); };
  }, []);

  function newModal() {
    let form = { disaster_name: '', disaster_type: 'Flood', brgy: '', severity: 'Medium', field_remarks: '' };
    openModal({
      title: 'Log Disaster Incident',
      body: <IncidentForm initial={form} onChange={f => (form = f)} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          if (!form.disaster_name || !form.disaster_type) { toast('Disaster name and type are required', 'bad'); return; }
          try {
            const result = await api.post('/incidents', form);
            closeModal();
            toast(savedMessage(result, 'Incident logged'), 'ok');
            load();
          }
          catch (e) { toast(e.message, 'bad'); }
        }}><Plus size={14} />Log Incident</Button>
      </>
    });
  }

  function cycleStatus(i) {
    const index = STATUSES.indexOf(i.reporting_status);
    const next = i.reporting_status === 'Resolved' ? 'Active' : STATUSES[index + 1] || 'Pending';
    openConfirm({ title: 'Update incident status?',
      msg: `<b>${i.disaster_name}</b> will change from ${i.reporting_status} to ${next}.`,
      confirmLabel: `Mark ${next}`, variant: 'primary',
      onConfirm: async () => {
        const result = await api.patch(`/incidents/${i.incident_id}/status`, { reporting_status: next });
        toast(savedMessage(result, `Incident marked ${next}`), 'ok');
        load();
      }
    });
  }

  function remove(i) {
    openConfirm({
      title: 'Delete incident?',
      msg: `<b>${i.disaster_name}</b> will be permanently removed.`,
      onConfirm: async () => {
        try { await api.del(`/incidents/${i.incident_id}`); toast('Incident deleted', 'ok'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  return (
    <>
      <LoadError message={loadError} onRetry={load} />
      <PageHeader title="Disaster Incidents" subtitle="Active and past incidents reported by field personnel and admin staff"
        actions={<Button onClick={newModal}><Plus size={14} />Log Incident</Button>} />


      {loading && <Skeleton label="Loading incidents" />}
      <div className="glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>{['Disaster', 'Type', 'Barangay', 'Severity', 'Incident status', 'Reported', 'Actions'].map(h => (
              <th key={h} className="text-left text-[0.6875rem] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {pager.items.map(i => (
              <tr key={i.incident_id} className="border-b border-navy-900/8">
                <td className="px-4 py-3 text-[0.78125rem] text-navy-900"><b>{i.disaster_name}</b>{i.pending_sync && <span className="pending-sync-badge">Pending sync</span>}</td>
                <td className="px-4 py-3 text-[0.78125rem] text-navy-900/65">{i.disaster_type}</td>
                <td className="px-4 py-3 text-[0.78125rem] text-navy-900/65">{i.brgy || '—'}</td>
                <td className="px-4 py-3"><Badge className={SEV_PILL[i.severity]}>{i.severity}</Badge></td>
                <td className="px-4 py-3">
                  <button onClick={() => cycleStatus(i)}>
                    <Badge className={STATUS_PILL[i.reporting_status] + ' cursor-pointer hover:brightness-125'}>{i.reporting_status}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-[0.75rem] text-navy-900/45">{new Date(i.date_started).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" aria-label={`DROMIC reports for ${i.disaster_name}`} onClick={() => onNav('dromic', { incidentId: i.incident_id })}>
                      <FileText size={14} aria-hidden="true" />Reports
                    </Button>
                    {isAdmin && <Button size="sm" variant="ghost" aria-label={`Delete ${i.disaster_name}`} onClick={() => remove(i)}><Trash2 size={15} aria-hidden="true" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !loadError && !incidents.length && <SharedEmptyState title="No incidents logged" message="Log an incident to begin coordinating evacuation activity." action="Log incident" onAction={newModal} />}
      {!loading && <Pagination pager={pager} />}
    </>
  );
}

function IncidentForm({ initial, onChange }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); onChange(next); };
  return (
    <>
      <Field label="Disaster Name"><Ctrl><TextInput value={form.disaster_name} onChange={e => set('disaster_name', e.target.value)} placeholder="e.g. Flooding Emergency" /></Ctrl></Field>
      <Field label="Disaster Type"><Ctrl><Select value={form.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
        {['Flood', 'Fire', 'Landslide', 'Road Blockage', 'Earthquake', 'Typhoon', 'Other'].map(t => <option key={t}>{t}</option>)}
      </Select></Ctrl></Field>
      <Field label="Barangay"><Ctrl><TextInput value={form.brgy} onChange={e => set('brgy', e.target.value)} placeholder="e.g. Barangay 12" /></Ctrl></Field>
      <Field label="Severity"><Ctrl><Select value={form.severity} onChange={e => set('severity', e.target.value)}><option>High</option><option>Medium</option><option>Low</option></Select></Ctrl></Field>
      <Field label="Field Remarks"><Ctrl><TextArea value={form.field_remarks} onChange={e => set('field_remarks', e.target.value)} placeholder="What's happening on the ground…" /></Ctrl></Field>
    </>
  );
}