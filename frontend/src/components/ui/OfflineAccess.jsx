import React, { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { needsOfflineUpgrade } from '../../lib/sync.js';
import Button from './Button.jsx';

function LegacyOfflineAccess({ restore }) {
  const { openDevice } = useAuth();
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
      await openDevice(passphrase);
      closeModal();
      toast(restore ? 'Previous offline saves opened.' : 'Offline access upgraded.');
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
      <Button type="submit" disabled={busy}>{busy ? 'Opening…' : restore ? 'Open saved work' : 'Transfer offline saves'}</Button>
    </div>
  </form>;
}

export function useOfflineAccess({ restore = false } = {}) {
  const { openDevice, restoreDevice } = useAuth();
  const { openModal, toast } = useUi();
  const [preparing, setPreparing] = useState(false);
  const running = useRef(false);

  async function openOffline() {
    if (needsOfflineUpgrade()) {
      openModal({
        title: restore ? 'Open previous offline saves' : 'Upgrade offline access',
        body: <LegacyOfflineAccess restore={restore} />
      });
      return;
    }
    if (running.current) return;
    running.current = true;
    setPreparing(true);
    try {
      if (restore) {
        if (!await restoreDevice()) throw new Error('Sign in with the account that prepared this browser.');
      } else {
        await openDevice();
        toast('This browser is ready for offline work.');
      }
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      running.current = false;
      setPreparing(false);
    }
  }

  return { openOffline, preparing };
}
