import React, { useEffect, useState } from 'react';
import { Trash2, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/Shell.jsx';
import Badge, { STATUS_PILL } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { api } from '../lib/api.js';
import { useUi } from '../context/UiContext.jsx';
import { getSocket } from '../lib/socket.js';

export default function PriorityCases() {
  const { toast, openConfirm } = useUi();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setCases(await api.get('/priority-cases')); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const s = getSocket();
    const handler = () => load();
    s.on('priority_case_flagged', handler);
    return () => s.off('priority_case_flagged', handler);
  }, []);

  async function setStatus(pc, status) {
    try { await api.patch(`/priority-cases/${pc.priority_id}/status`, { priority_status: status }); toast('Status updated', 'ok'); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function remove(pc) {
    openConfirm({
      title: 'Remove priority flag?',
      msg: `This flag on <b>${pc.first_name} ${pc.last_name}</b> will be removed.`,
      onConfirm: async () => {
        try { await api.del(`/priority-cases/${pc.priority_id}`); toast('Flag removed', 'bad'); load(); }
        catch (e) { toast(e.message, 'bad'); }
      }
    });
  }

  return (
    <>
      <PageHeader title="Priority Cases" subtitle="Vulnerable evacuees flagged for special assistance — elderly, PWD, pregnant, infants, and more" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cases.map(pc => (
          <div key={pc.priority_id} className="glass rounded-glass shadow-glass-sm p-5">
            <div className="flex justify-between items-start mb-2">
              <b className="text-[14px] text-navy-900">{pc.first_name} {pc.last_name}</b>
              <Badge className={STATUS_PILL[pc.priority_status]}>{pc.priority_status}</Badge>
            </div>
            <div className="text-[11px] text-navy-900/45 mb-3">{pc.family_name} · {pc.barangay}</div>
            <Badge className="bg-pink-bg text-pink mb-3">{pc.case_type}</Badge>
            {pc.description && <p className="text-[12px] text-navy-900/65 leading-relaxed mb-3">{pc.description}</p>}
            <div className="flex gap-2 mt-2">
              {pc.priority_status !== 'Resolved' && (
                <Button size="sm" className="flex-1" onClick={() => setStatus(pc, pc.priority_status === 'Flagged' ? 'Attended' : 'Resolved')}>
                  <Check size={13} />{pc.priority_status === 'Flagged' ? 'Mark Attended' : 'Mark Resolved'}
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => remove(pc)}><Trash2 size={13} /></Button>
            </div>
          </div>
        ))}
      </div>
      {!loading && !cases.length && <p className="text-navy-900/45 text-[12.5px] mt-4">No priority cases flagged yet. Flag one from the Evacuees page when registering.</p>}
    </>
  );
}
