import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL, SEV_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextInput, TextArea, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

const STATUSES = ['Pending', 'En Route', 'Active', 'Resolved'];

export default function Incidents() {
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setIncidents(await api.get('/incidents')); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }

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
          try { await api.post('/incidents', form); closeModal(); toast('Incident logged', 'ok'); load(); }
          catch (e) { toast(e.message, 'bad'); }
        }}><Plus size={14} />Log Incident</Button>
      </>
    });
  }

  async function cycleStatus(i) {
    const next = STATUSES[(STATUSES.indexOf(i.reporting_status) + 1) % STATUSES.length];
    try { await api.patch(`/incidents/${i.incident_id}/status`, { reporting_status: next }); toast(`Status → ${next}`, 'ok'); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function remove(i) {
    openConfirm({
      title: 'Delete incident?',
      msg: `<b>${i.disaster_name}</b> will be permanently removed.`,
      onConfirm: async () => {
        try { await api.del(`/incidents/${i.incident_id}`); toast('Incident deleted', 'bad'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  return (
    <>
      <PageHeader title="Disaster Incidents" subtitle="Active and past incidents reported by field personnel and admin staff"
        actions={<Button onClick={newModal}><Plus size={14} />Log Incident</Button>} />

      <div className="glass rounded-glass shadow-glass-sm overflow-x-auto scroll-thin">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>{['Disaster', 'Type', 'Barangay', 'Severity', 'Status (click to advance)', 'Reported', ''].map(h => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wide text-navy-900/45 font-semibold px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {incidents.map(i => (
              <tr key={i.incident_id} className="border-b border-navy-900/8">
                <td className="px-4 py-3 text-[12.5px] text-navy-900"><b>{i.disaster_name}</b></td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{i.disaster_type}</td>
                <td className="px-4 py-3 text-[12.5px] text-navy-900/65">{i.brgy || '—'}</td>
                <td className="px-4 py-3"><Badge className={SEV_PILL[i.severity]}>{i.severity}</Badge></td>
                <td className="px-4 py-3">
                  <button onClick={() => cycleStatus(i)}>
                    <Badge className={STATUS_PILL[i.reporting_status] + ' cursor-pointer hover:brightness-125'}>{i.reporting_status}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-[12px] text-navy-900/45">{new Date(i.date_started).toLocaleString()}</td>
                <td className="px-4 py-3"><button onClick={() => remove(i)} className="text-navy-900/45 hover:text-danger"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !incidents.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No incidents logged yet.</p>}
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
