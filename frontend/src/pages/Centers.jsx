import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, ImagePlus, Building2 } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import { ProgressBar } from '../components/ui/StatCard.jsx';
import { Field, Ctrl, TextInput, Select } from '../components/ui/Field.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

function occColor(pct) {
  if (pct >= 90) return '#F87171';
  if (pct >= 70) return '#FBBF24';
  if (pct >= 40) return '#60A5FA';
  return '#34D399';
}

export default function Centers() {
  const { toast, openModal, closeModal, openConfirm, openSuccess } = useUi();
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setCenters(await api.get('/centers')); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('center_updated', handler);
    return () => s.off('center_updated', handler);
  }, []);

  function centerModal(existing) {
    let form = existing
      ? { center_name: existing.center_name, barangay: existing.barangay, address: existing.address || '', capacity: existing.capacity, status: existing.status, image_url: existing.image_url || '' }
      : { center_name: '', barangay: '', address: '', capacity: '', status: 'Open', image_url: '' };
    let imageFile = null;

    openModal({
      title: existing ? 'Edit Center' : 'Add Evacuation Center',
      sub: existing ? existing.center_name : 'Register a new designated center',
      body: <CenterForm initial={form} onChange={f => (form = f)} onFile={f => (imageFile = f)} />,
      footer: <>
        <Button variant="ghost" block onClick={closeModal}>Cancel</Button>
        <Button block onClick={async () => {
          if (!form.center_name || !form.barangay) { toast('Center name and barangay are required', 'bad'); return; }
          try {
            const payload = { ...form };
            if (imageFile) payload.image = imageFile;
            if (existing) await api.putForm(`/centers/${existing.center_id}`, payload);
            else await api.postForm('/centers', payload);
            closeModal();
            load();
            openSuccess({ title: existing ? 'Center Updated' : 'Center Added', message: form.center_name });
          } catch (e) { toast(e.message, 'bad'); }
        }}>{existing ? 'Save Changes' : 'Add Center'}</Button>
      </>
    });
  }

  function delCenter(c) {
    openConfirm({
      title: 'Remove center?',
      msg: `<b>${c.center_name}</b> will be permanently removed.`,
      onConfirm: async () => {
        try { await api.del(`/centers/${c.center_id}`); toast('Center removed', 'bad'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  return (
    <>
      <PageHeader title="Evacuation Centers" subtitle="Directory and live capacity of all designated centers"
        actions={<Button onClick={() => centerModal(null)}><Plus size={14} />Add Center</Button>} />

      {loading && <p className="text-navy-900/45 text-[12.5px]">Loading…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {centers.map(c => {
          const pct = c.capacity ? Math.round((c.occupancy / c.capacity) * 100) : 0;
          return (
            <div key={c.center_id} className="glass rounded-glass shadow-glass-sm overflow-hidden">
              <div className="h-[130px] bg-navy-900/6 relative">
                {c.image_url
                  ? <img src={c.image_url} alt={c.center_name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full grid place-items-center text-navy-900/25"><Building2 size={32} /></div>}
                <span className="absolute top-2.5 right-2.5"><Badge className={STATUS_PILL[c.status]}>{pct >= 90 ? 'Near Full' : c.status}</Badge></span>
              </div>
              <div className="p-5">
                <b className="text-[14px] text-navy-900 leading-snug block">{c.center_name}</b>
                <div className="text-[11px] text-navy-900/45 my-2 flex items-center gap-1"><MapPin size={11} />{c.barangay}</div>
                <div className="flex justify-between text-[12px] mb-1.5 text-navy-900/65"><span>Occupancy</span><b className="text-navy-900">{c.occupancy} / {c.capacity}</b></div>
                <ProgressBar pct={pct} color={occColor(pct)} />
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => centerModal(c)}><Edit2 size={13} />Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => delCenter(c)}><Trash2 size={13} /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!loading && !centers.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No evacuation centers yet — add the first one above.</p>}
    </>
  );
}

function CenterForm({ initial, onChange, onFile }) {
  const { toast } = useUi();
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState(initial.image_url || '');
  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); onChange(next); };

  // Phone photos are often 4-12 MB. Resize to max 1280px JPEG (~150-300 KB)
  // in the browser before uploading, so it is fast and under the size limit.
  async function shrink(file, maxSide = 1280, quality = 0.82) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparent PNGs would turn black as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
      return blob ? new File([blob], 'center.jpg', { type: 'image/jpeg' }) : file;
    } catch (err) {
      // The browser couldn't decode it. Plain web formats can still be sent
      // as-is; anything else (e.g. HEIC on Chrome/Windows) can't be shown.
      return /^image\/(jpe?g|png|webp|gif)$/.test(file.type) ? file : null;
    }
  }

  async function pickImage(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const file = await shrink(picked);
    if (!file) { toast('This photo format cannot be read by your browser. Please choose a JPG or PNG.', 'bad'); e.target.value = ''; return; }
    onFile(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <>
      <Field label="Center Photo">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="w-[84px] h-[64px] rounded-xl bg-navy-900/6 overflow-hidden grid place-items-center shrink-0">
            {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={20} className="text-navy-900/30" />}
          </div>
          <div>
            <span className="text-[12px] font-semibold text-accent-700">{preview ? 'Change photo' : 'Upload photo'}</span>
            <p className="text-[10.5px] text-navy-900/40">JPG, PNG or WEBP — up to 5MB</p>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
        </label>
      </Field>
      <Field label="Center Name"><Ctrl><TextInput value={form.center_name} onChange={e => set('center_name', e.target.value)} placeholder="e.g. Brgy. 5 Covered Court" /></Ctrl></Field>
      <Field label="Barangay"><Ctrl><TextInput value={form.barangay} onChange={e => set('barangay', e.target.value)} placeholder="e.g. Barangay 5" /></Ctrl></Field>
      <Field label="Address"><Ctrl><TextInput value={form.address || ''} onChange={e => set('address', e.target.value)} /></Ctrl></Field>
      <Field label="Capacity"><Ctrl><TextInput type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="e.g. 250" /></Ctrl></Field>
      <Field label="Status"><Ctrl><Select value={form.status} onChange={e => set('status', e.target.value)}>
        <option>Open</option><option>Full</option><option>Standby</option><option>Closed</option>
      </Select></Ctrl></Field>
    </>
  );
}
