import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { isPrepared } from '../../lib/sync.js';
import Button from './Button.jsx';

function DeviceAccess({ prepared }) {
  const { openDevice } = useAuth();
  const { closeModal, toast } = useUi();
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await openDevice(passphrase, confirmation);
      closeModal();
      toast(prepared ? 'Offline data unlocked.' : 'This browser is ready to save offline.');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-slate-600">{prepared
      ? 'Enter this browser’s offline passphrase to open your saved RESCOM data.'
      : 'Choose a passphrase with at least 16 characters. RESCOM will keep field records and pending saves encrypted in this browser.'}</p>
    <label className="block text-sm font-medium">
      Offline passphrase
      <input type="password" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" autoComplete={prepared ? 'current-password' : 'new-password'}
        value={passphrase} onChange={event => setPassphrase(event.target.value)} required />
    </label>
    {!prepared && <label className="block text-sm font-medium">
      Confirm offline passphrase
      <input type="password" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" autoComplete="new-password"
        value={confirmation} onChange={event => setConfirmation(event.target.value)} required />
    </label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={closeModal} disabled={busy}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : prepared ? 'Unlock RESCOM' : 'Enable offline access'}</Button>
    </div>
  </form>;
}

export function useOfflineAccess() {
  const { openModal } = useUi();
  return () => {
    const prepared = isPrepared();
    openModal({
      title: prepared ? 'Unlock offline data' : 'Enable offline access',
      body: <DeviceAccess prepared={prepared} />
    });
  };
}
