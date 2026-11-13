'use client';

import { AlertCircle, CloudUpload, RefreshCw } from 'lucide-react';
import { blockedDependencies, type Change, type Space } from '../lib/offline';
import { Button, Empty, Modal, Tag } from './ui';

const names = { centers: 'Evacuation center', households: 'Household', events: 'Disaster event', reports: 'DROMIC report' };

export default function SyncReview({ changes, space, online, syncing, onClose, onRefresh, onReview, onDiscard }: {
  changes: Change[];
  space: Space;
  online: boolean;
  syncing: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onReview: (change: Change) => void;
  onDiscard: (change: Change) => Promise<void>;
}) {
  const blocked = blockedDependencies(changes);
  return (
    <Modal title="Sync status" subtitle="Changes saved on this device" onClose={onClose}>
      <div className="modal-body sync-items">
        {!changes.length && <Empty title="No pending changes" text="RESCOM will send new offline saves when the connection returns." />}
        {changes.map(change => (
          <article className="sync-item" key={change.id}>
            <span className={'record-icon ' + (blocked.has(change.id) ? 'orange' : '')}>
              {blocked.has(change.id) ? <AlertCircle size={18} /> : <CloudUpload size={18} />}
            </span>
            <div>
              <h3>{change.data.name || change.data.headName || names[change.kind]}</h3>
              <p>{names[change.kind]} · {change.space === 'training' ? 'Training' : 'Live'}</p>
              {change.error && <p className="sync-error">{change.error}</p>}
              {!change.error && blocked.has(change.id) && <p>Waiting for a related change to be reviewed.</p>}
              <div className="sync-item-actions">
                <Tag tone={blocked.has(change.id) ? 'orange' : 'blue'}>{blocked.has(change.id) ? 'Needs review' : 'Pending sync'}</Tag>
                {change.error && space === change.space && <button className="text-btn" onClick={() => onReview(change)}>Review and edit</button>}
                {change.error && <button className="text-btn" onClick={() => {
                  if (window.confirm('Discard this change and any pending changes that depend on it?')) void onDiscard(change);
                }}>Discard</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button busy={syncing} disabled={!online || !changes.some(change => !blocked.has(change.id))} onClick={onRefresh}>
          <RefreshCw size={16} /> Sync now
        </Button>
      </div>
    </Modal>
  );
}
