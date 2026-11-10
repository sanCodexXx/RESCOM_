import React, { useState, useSyncExternalStore } from 'react';
import { api } from '../../lib/api.js';
import { useUi } from '../../context/UiContext.jsx';
import { subscribeSync, syncStatus } from '../../lib/sync.js';
import Button from './Button.jsx';

function RecoverSavesForm() {
  const { closeModal, toast } = useUi();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await api.recoverOfflineSaves(passphrase);
      closeModal();
      toast('Previous saves recovered.');
      api.syncOffline().catch(() => {});
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-slate-600">Use the passphrase you set for this browser’s previous offline saves.</p>
    <label className="block text-sm font-medium">
      Previous offline passphrase
      <input type="password" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" autoComplete="current-password"
        value={passphrase} onChange={event => setPassphrase(event.target.value)} required />
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={closeModal} disabled={busy}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? 'Recovering…' : 'Recover saves'}</Button>
    </div>
  </form>;
}

export default function RecoverPreviousSaves() {
  const { hasPreviousSaves, needsSignIn, reachable } = useSyncExternalStore(subscribeSync, syncStatus);
  const { openModal } = useUi();
  if (!hasPreviousSaves) return null;

  return <div className="glass rounded-glass p-4 text-center">
    <p className="mb-2 text-sm text-slate-600">This browser has saves from the previous passphrase setup.</p>
    <Button size="sm" variant="ghost" disabled={!reachable || needsSignIn}
      onClick={() => openModal({ title: 'Recover previous saves', body: <RecoverSavesForm /> })}>
      Recover previous saves
    </Button>
  </div>;
}
