import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { api, BASE_URL } from '../../lib/api.js';
import { discardReviewedWrite, isPrepared, refreshRecords, setReachable, subscribeSync, syncStatus } from '../../lib/sync.js';
import Button from './Button.jsx';
import { useOfflineAccess } from './OfflineAccess.jsx';

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
  const { refreshSession, signInToSync } = useAuth();
  const { openModal } = useUi();
  const openOffline = useOfflineAccess();
  const { unlocked, pending, review, syncing, needsSignIn, reachable } = useSyncExternalStore(subscribeSync, syncStatus);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const controller = useRef(null);
  const check = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setOffline(!navigator.onLine);
    if (!navigator.onLine) {
      setReachable(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timeout = setTimeout(() => current.abort(), 12000);
    try {
      const response = await fetch(`${BASE_URL}/api/health`, { signal: current.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status !== 'ok') throw new Error('unavailable');
    } catch {
      if (controller.current === current) {
        setReachable(false);
        setChecking(false);
      }
      return;
    } finally {
      clearTimeout(timeout);
    }
    if (controller.current !== current) return;
    const recovered = !syncStatus().reachable;
    setReachable(true);
    setChecking(false);
    if (syncStatus().needsSignIn && localStorage.getItem('rescom_token')) await refreshSession();
    await api.syncOffline().catch(() => {});
    if (recovered && controller.current === current && syncStatus().reachable) refreshRecords();
  }, [refreshSession]);

  useEffect(() => {
    check();
    const checkVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(checkVisible, 25000);
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

  const connection = offline ? 'offline' : !reachable ? 'unavailable' : checking ? 'checking' : 'online';
  const labels = { checking: 'Checking connection', online: 'RESCOM online', offline: 'Offline', unavailable: 'Connection unavailable' };
  return <div className={`connection-status connection-${connection}`}>
    <span role="status" className="flex items-center gap-2">{reachable && !offline ? <Wifi size={15} /> : <WifiOff size={15} />}{labels[connection]}</span>
    <button type="button" aria-label="Check API connection" title="Check API connection" disabled={checking} onClick={check}>
      <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
    </button>
    {!unlocked && (isPrepared() || connection === 'online') && (
      <button type="button" className="connection-offline-action" onClick={openOffline}>
        <WifiOff size={14} aria-hidden="true" /> {isPrepared() ? 'Unlock offline data' : 'Enable offline access'}
      </button>
    )}
    {!unlocked && !reachable && !isPrepared() && <span>Enable offline access while connected to save on this browser.</span>}
    {unlocked && <span role="status">{syncing ? 'Syncing saves…' : pending ? `${pending} pending sync` : review.length ? '' : 'No pending saves'}</span>}
    {unlocked && needsSignIn && connection === 'online' && (
      <button type="button" className="connection-offline-action" onClick={signInToSync}>Sign in to sync</button>
    )}
    {review.length > 0 && (
      <button type="button" className="connection-offline-action" onClick={() => openModal({
        title: 'Review device saves', body: <SyncReview />
      })}>{review.length} need review</button>
    )}
  </div>;
}
