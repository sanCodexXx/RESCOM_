import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { api, BASE_URL } from '../../lib/api.js';
import { discardReviewedWrite, refreshRecords, setReachable, subscribeSync, syncStatus } from '../../lib/sync.js';
import Button from './Button.jsx';

function SyncReview() {
  const { review, reachable, needsSignIn } = useSyncExternalStore(subscribeSync, syncStatus);
  const { openConfirm, toast } = useUi();

  async function retry() {
    try { await api.retryOffline(); }
    catch (error) { toast(error.message, 'bad'); }
  }

  return <div className="space-y-4">
    <p>These changes are saved on this device. Resolve the listed issues before retrying.</p>
    {review.map(({ id, label, review: reason }) => (
      <div className="rounded-xl border border-slate-200 p-3" key={id}>
        <p className="font-semibold break-words">{label}</p>
        <p className="mt-1 text-slate-600">{reason}</p>
        <Button className="mt-2" size="sm" variant="ghost" onClick={() => openConfirm({
          title: 'Discard this device save?',
          msg: 'This removes the saved change from this browser.',
          confirmLabel: 'Discard save',
          onConfirm: () => discardReviewedWrite(id)
        })}>Discard</Button>
      </div>
    ))}
    <Button disabled={!review.length || !reachable || needsSignIn} onClick={retry}>Retry changes</Button>
  </div>;
}

export default function ConnectionStatus() {
  const { refreshSession, prepareDevice, signInToSync } = useAuth();
  const { openModal } = useUi();
  const { unlocked, pending, review, syncing, needsSignIn, reachable } = useSyncExternalStore(subscribeSync, syncStatus);
  const controller = useRef(null);

  const check = useCallback(async () => {
    controller.current?.abort();
    if (!navigator.onLine) {
      controller.current = null;
      setReachable(false);
      return;
    }
    const current = new AbortController();
    controller.current = current;
    const timeout = setTimeout(() => current.abort(), 6000);
    try {
      const response = await fetch(`${BASE_URL}/api/health`, { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status !== 'ok') throw new Error('RESCOM unavailable');
    } catch {
      if (controller.current === current) setReachable(false);
      return;
    } finally {
      clearTimeout(timeout);
    }
    if (controller.current !== current) return;

    const recovered = !syncStatus().reachable;
    setReachable(true);
    if (syncStatus().needsSignIn) await refreshSession();
    if (controller.current !== current) return;
    await prepareDevice().catch(() => {});
    await api.syncOffline().catch(() => {});
    if (recovered && controller.current === current && syncStatus().reachable) refreshRecords();
  }, [prepareDevice, refreshSession]);

  useEffect(() => {
    check();
    const checkVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(checkVisible, 15000);
    document.addEventListener('visibilitychange', checkVisible);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      controller.current = null;
      document.removeEventListener('visibilitychange', checkVisible);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, [check]);

  return <div className={`connection-status connection-${reachable ? 'online' : 'offline'}`}>
    <span role="status" className="flex items-center gap-2">
      {reachable ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
      {reachable ? 'RESCOM online' : 'Offline mode'}
    </span>
    {!unlocked && !reachable && <span>Device saves unavailable</span>}
    {(syncing || pending > 0) && <span role="status">{syncing ? 'Syncing saves…' : `${pending} pending sync`}</span>}
    {unlocked && needsSignIn && reachable && (
      <button type="button" className="connection-offline-action" onClick={signInToSync}>Sign in to sync</button>
    )}
    {review.length > 0 && (
      <button type="button" className="connection-offline-action" onClick={() => openModal({
        title: 'Review device saves', body: <SyncReview />
      })}>{review.length} need review</button>
    )}
  </div>;
}
