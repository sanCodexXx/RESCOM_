import React, { useEffect, useRef, useState } from 'react';
import { Plus, LogOut, Search, Edit2, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { Field, Ctrl, TextInput, Select, RadioGroup } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';
import { BARANGAYS, normalizePhPhone, stripPhoneChars } from '../lib/barangays.js';
import { peekSeed, clearSeed } from '../lib/searchSeed.js';

const PRIORITY_TYPES = ['Elderly', 'PWD', 'Pregnant', 'Infant', 'Lactating Mother', 'With Illness', 'Solo Parent'];

function validateEvacuee(f, { full = true } = {}) {
  const e = {};
  if (!f.first_name.trim()) e.first_name = 'Required';
  if (!f.last_name.trim()) e.last_name = 'Required';
  const age = Number(f.age);
  if (f.age === '' || f.age == null || !Number.isInteger(age) || age < 0 || age > 120) e.age = 'Enter a whole number, 0 to 120';
  if (!['Male', 'Female'].includes(f.gender)) e.gender = 'Select Male or Female';
  if (full) {
    if (!f.family_name.trim()) e.family_name = 'Required';
    if (!BARANGAYS.includes(f.barangay)) e.barangay = 'Select a barangay';
    if (!normalizePhPhone(f.contact_number)) e.contact_number = 'Enter a valid PH mobile number, e.g. +63 917 123 4567';
    if (!f.center_id) e.center_id = 'Select an evacuation center';
    if (!f.incident_id) e.incident_id = 'Select the disaster incident';
  }
  return e;
}

export default function Evacuees() {
  const { toast, openModal, closeModal, openConfirm } = useUi();
  const [evacuees, setEvacuees] = useState([]);
  const [centers, setCenters] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [q, setQ] = useState(() => peekSeed('evacuees') || '');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [e, c, i] = await Promise.all([api.get('/evacuees'), api.get('/centers'), api.get('/incidents')]);
      setEvacuees(e); setCenters(c); setIncidents(i);
    } catch (err) { toast(err.message, 'bad'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    clearSeed();
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('evacuee_registered', handler);
    s.on('center_updated', handler);
    return () => { s.off('evacuee_registered', handler); s.off('center_updated', handler); };
  }, []);

  const filtered = evacuees.filter(e => `${e.first_name} ${e.last_name} ${e.family_name} ${e.barangay}`.toLowerCase().includes(q.toLowerCase()));

  function checkout(e) {
    openConfirm({
      title: 'Check out evacuee?',
      msg: `<b>${e.first_name} ${e.last_name}</b> will be marked as checked out and the center headcount will decrease.`,
      onConfirm: async () => {
        try { await api.patch(`/evacuees/${e.evacuee_id}/checkout`); toast('Evacuee checked out', 'ok'); load(); }
        catch (err) { toast(err.message, 'bad'); }
      }
    });
  }

  function editModal(e) {
    let form = { first_name: e.first_name, middle_name: e.middle_name || '', last_name: e.last_name, age: e.age ?? '', gender: e.gender || '' };
    const ctl = {};
    openModal({
      title: 'Edit Evacuee',
      sub: `${e.first_name} ${e.last_name}`,
      body: <EditForm initial={form} ctl={ctl} onChange={f => (form = f)} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          const errs = validateEvacuee(form, { full: false });
          if (Object.keys(errs).length) { ctl.setErrors?.(errs); toast('Please complete all required fields', 'bad'); return; }
          try { await api.put(`/evacuees/${e.evacuee_id}`, { ...form, age: parseInt(form.age, 10) }); closeModal(); toast('Evacuee updated', 'ok'); load(); }
          catch (err) { toast(err.message, 'bad'); }
        }}>Save Changes</Button>
      </>
    });
  }

  function removeEvacuee(e) {
    openConfirm({
      title: 'Delete evacuee record?',
      msg: `<b>${e.first_name} ${e.last_name}</b> and their evacuation history will be permanently removed. This cannot be undone.`,
      onConfirm: async () => {
        try { await api.del(`/evacuees/${e.evacuee_id}`); toast('Evacuee deleted', 'bad'); load(); }
        catch (err) { toast(err.message, 'bad'); }
      }
    });
  }

  function registerModal() {
    const openIncidents = incidents.filter(i => i.reporting_status !== 'Resolved');
    if (!centers.length) { toast('Add an evacuation center first (Evacuation Centers page).', 'bad'); return; }
    if (!openIncidents.length) { toast('Log a Disaster Incident first. Every evacuee must be linked to one.', 'bad'); return; }
    let form = {
      family_name: '', barangay: '', contact_number: '',
      first_name: '', middle_name: '', last_name: '', age: '', gender: '',
      center_id: (centers.find(c => c.capacity - c.occupancy > 0) || centers[0]).center_id,
      incident_id: openIncidents[0].incident_id,
      priority_types: []
    };
    const ctl = {};
    openModal({
      title: 'Register Evacuee',
      sub: 'Log a new family and its members at an evacuation center. Fields marked * are required.',
      body: <RegisterForm initial={form} ctl={ctl} centers={centers} incidents={openIncidents} onChange={f => (form = f)} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          const errs = validateEvacuee(form);
          if (Object.keys(errs).length) { ctl.setErrors?.(errs); toast('Please complete all required fields', 'bad'); return; }
          try {
            await api.post('/evacuees/register', {
              family: { family_name: form.family_name.trim(), barangay: form.barangay, contact_number: normalizePhPhone(form.contact_number) },
              evacuee: { first_name: form.first_name.trim(), middle_name: form.middle_name.trim(), last_name: form.last_name.trim(), age: parseInt(form.age, 10), gender: form.gender },
              center_id: form.center_id,
              incident_id: form.incident_id,
              priority_types: form.priority_types
            });
            closeModal(); toast('Evacuee registered', 'ok'); load();
          } catch (e) { toast(e.message, 'bad'); }
        }}><Plus size={14} />Register</Button>
      </>
    });
  }

  return (
    <>
      <PageHeader title="Evacuees" subtitle="Registered evacuees, their family and priority status"
        actions={<Button onClick={registerModal}><Plus size={14} />Register Evacuee</Button>} />

      <div className="glass rounded-glass shadow-glass-sm p-5">
        <div className="flex items-center gap-2 bg-white border border-navy-900/15 rounded-xl px-3 py-2 mb-4 max-w-[320px] text-navy-900/45">
          <Search size={15} />
          <input className="border-0 outline-none bg-transparent text-[12.5px] text-navy-900 flex-1 min-w-0" placeholder="Search evacuee, family, barangay…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {loading && <p className="text-navy-900/45 text-[12.5px]">Loading…</p>}

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>{['Name', 'Age/Sex', 'Family', 'Barangay', 'Center', 'Priority', 'Status', ''].map(h => (
                <th key={h} className="text-left text-[11px] uppercase tracking-wide text-navy-900/45 font-semibold px-3 py-2.5">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.evacuee_id} className="border-b border-navy-900/8">
                  <td className="px-3 py-3 text-[12.5px] text-navy-900"><b>{e.first_name} {e.last_name}</b></td>
                  <td className="px-3 py-3 text-[12.5px] text-navy-900/65">{e.age ?? '—'} / {e.gender ?? '—'}</td>
                  <td className="px-3 py-3 text-[12.5px] text-navy-900/65">{e.family_name || '—'}</td>
                  <td className="px-3 py-3 text-[12.5px] text-navy-900/65">{e.barangay || '—'}</td>
                  <td className="px-3 py-3 text-[12.5px] text-navy-900/65">{e.center_name || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(e.priority_types || []).map(t => <Badge key={t} className="bg-pink-bg text-pink">{t}</Badge>)}
                      {!e.priority_types?.length && <span className="text-navy-900/28 text-[11px]">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3"><Badge className={STATUS_PILL[e.record_status] || 'bg-navy-900/8 text-navy-900/55'}>{e.record_status || 'No record'}</Badge></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 text-navy-900/45">
                      {e.record_status === 'Present' && (
                        <button onClick={() => checkout(e)} title="Check out" className="hover:text-accent-400 p-1"><LogOut size={15} /></button>
                      )}
                      <button onClick={() => editModal(e)} title="Edit" className="hover:text-accent-400 p-1"><Edit2 size={14} /></button>
                      <button onClick={() => removeEvacuee(e)} title="Delete" className="hover:text-danger p-1"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !filtered.length && <p className="text-navy-900/45 text-[12.5px] mt-4 text-center">No evacuees match your search.</p>}
      </div>
    </>
  );
}

function useFormState(initial, ctl) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  useEffect(() => { ctl.setErrors = setErrors; }, []);
  return { form, setForm, errors, setErrors };
}

function NameAgeGender({ form, set, errors }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
        <Field label="First Name" required error={errors.first_name}><Ctrl error={errors.first_name}><TextInput value={form.first_name} onChange={e => set('first_name', e.target.value)} autoComplete="off" /></Ctrl></Field>
        <Field label="Middle Name"><Ctrl><TextInput value={form.middle_name} onChange={e => set('middle_name', e.target.value)} autoComplete="off" placeholder="Optional" /></Ctrl></Field>
        <Field label="Last Name" required error={errors.last_name}><Ctrl error={errors.last_name}><TextInput value={form.last_name} onChange={e => set('last_name', e.target.value)} autoComplete="off" /></Ctrl></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Age" required error={errors.age}><Ctrl error={errors.age}><TextInput type="number" inputMode="numeric" min="0" max="120" value={form.age} onChange={e => set('age', e.target.value)} /></Ctrl></Field>
        <Field label="Gender" required error={errors.gender}><RadioGroup name="gender" value={form.gender} onChange={v => set('gender', v)} options={['Male', 'Female']} error={errors.gender} /></Field>
      </div>
    </>
  );
}

function EditForm({ initial, ctl, onChange }) {
  const { form, setForm, errors, setErrors } = useFormState(initial, ctl);
  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); onChange(next); if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest); };
  return <NameAgeGender form={form} set={set} errors={errors} />;
}

function RegisterForm({ initial, ctl, centers, incidents, onChange }) {
  const { form, setForm, errors, setErrors } = useFormState(initial, ctl);
  const autoFamily = useRef('');
  const set = (k, v) => {
    let next = { ...form, [k]: v };
    // Suggest "<Last name> Family" until the person types their own family name.
    if (k === 'last_name' && (form.family_name === '' || form.family_name === autoFamily.current)) {
      autoFamily.current = v.trim() ? `${v.trim()} Family` : '';
      next.family_name = autoFamily.current;
    }
    setForm(next); onChange(next);
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
  };
  const toggleTag = (t) => set('priority_types', form.priority_types.includes(t) ? form.priority_types.filter(x => x !== t) : [...form.priority_types, t]);
  return (
    <>
      <NameAgeGender form={form} set={set} errors={errors} />
      <Field label="Family Name" required error={errors.family_name}><Ctrl error={errors.family_name}><TextInput value={form.family_name} onChange={e => set('family_name', e.target.value)} placeholder="e.g. Santos Family" autoComplete="off" /></Ctrl></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Barangay of Origin" required error={errors.barangay}>
          <Ctrl error={errors.barangay}><Select value={form.barangay} onChange={e => set('barangay', e.target.value)}>
            <option value="">Select barangay…</option>
            {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </Select></Ctrl>
        </Field>
        <Field label="Contact Number" required error={errors.contact_number}>
          <Ctrl error={errors.contact_number}><TextInput type="tel" inputMode="tel" autoComplete="tel" maxLength={17} placeholder="+63 9XX XXX XXXX" value={form.contact_number} onChange={e => set('contact_number', stripPhoneChars(e.target.value))} /></Ctrl>
        </Field>
      </div>
      <Field label="Evacuation Center" required error={errors.center_id}><Ctrl error={errors.center_id}><Select value={form.center_id} onChange={e => set('center_id', e.target.value)}>
        {centers.map(c => { const left = c.capacity - c.occupancy; return <option key={c.center_id} value={c.center_id} disabled={left <= 0}>{c.center_name} ({left > 0 ? `${left} slots left` : 'full'})</option>; })}
      </Select></Ctrl></Field>
      <Field label="Related Disaster Incident" required error={errors.incident_id}><Ctrl error={errors.incident_id}><Select value={form.incident_id} onChange={e => set('incident_id', e.target.value)}>
        {incidents.map(i => <option key={i.incident_id} value={i.incident_id}>{i.disaster_name}</option>)}
      </Select></Ctrl></Field>
      <Field label="Priority Tags (optional)">
        <div className="flex flex-wrap gap-2">
          {PRIORITY_TYPES.map(t => (
            <button key={t} type="button" onClick={() => toggleTag(t)}
              className={`text-[12px] rounded-lg px-3 py-2 border ${form.priority_types.includes(t) ? 'bg-pink-600 border-pink-600 text-white font-semibold' : 'bg-navy-900/4 border-navy-900/12 text-navy-900/65'}`}>
              {t}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}