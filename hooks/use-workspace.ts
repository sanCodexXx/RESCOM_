'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { request, RequestError, unavailable } from '../lib/api-client';
import { kinds, type Kind } from '../lib/domain';
import {
  applyChanges, blockedDependencies, clearActive, emptyWorkspace, listChanges, readActive, readSnapshot,
  removeChanges, saveActive, saveSnapshot, writeChange, type Change, type Space, type Staff, type Workspace,
} from '../lib/offline';

type Connection = 'checking' | 'online' | 'offline' | 'signed-out';
type Context = { user: Staff; space: Space };
type Saved = { id: string; updatedAt: string; record?: Workspace[Kind][number] };
const stamp = () => new Date().toISOString();
const localLock = 'rescom-signed-out';

function changePath(change: Change) {
  return change.kind + (change.method === 'PUT' ? '/' + encodeURIComponent(change.recordId) : '');
}

function pushChange(change: Change) {
  return request<Saved>(changePath(change), change.space, change.method, change.data, {
    'X-Rescom-Operation': change.id,
    'X-Rescom-Account': change.owner,
    'X-Rescom-Record': change.recordId,
    ...(change.after ? { 'X-Rescom-After': change.after } : {}),
  });
}

export function useWorkspace(refreshInterval: number) {
  const [user, setUser] = useState<Staff | null>(null);
  const [workspace, setWorkspace] = useState<Space>('training');
  const [data, setData] = useState(emptyWorkspace);
  const [changes, setChanges] = useState<Change[]>([]);
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection>('checking');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [loadError, setLoadError] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [storageReady, setStorageReady] = useState(true);

  const context = useRef<Context | null>(null);
  const base = useRef(emptyWorkspace);
  const online = useRef<Connection>('checking');
  const refreshTicket = useRef(0);
  const runningSync = useRef<Promise<void> | null>(null);
  const runningRefresh = useRef<Promise<void> | null>(null);
  const accessExpires = useRef(false);
  const heartbeat = useRef(false);

  const connectionChanged = useCallback((value: Connection) => {
    online.current = value;
    setConnection(value);
  }, []);

  const adopt = useCallback((active: Context | null) => {
    context.current = active;
    setUser(active?.user || null);
    if (active) setWorkspace(active.space);
  }, []);

  const renderData = useCallback(async (active: Context, raw: Workspace, ticket?: number) => {
    let pending: Change[];
    try {
      pending = await listChanges(active.user.id);
    } catch {
      if (context.current === active) setStorageReady(false);
      pending = [];
    }
    if (context.current !== active || (ticket !== undefined && ticket !== refreshTicket.current)) return;
    base.current = raw;
    setChanges(pending);
    setData(applyChanges(raw, pending, active.space));
  }, []);

  const load = useCallback(async (space: Space, show = false) => {
    const active = context.current;
    if (!active || active.space !== space) return;
    const ticket = ++refreshTicket.current;
    if (show) setLoading(true);
    try {
      const result = await request<Workspace>('workspace', space);
      if (ticket !== refreshTicket.current || context.current !== active) return;
      if (!result.user || result.user.id !== active.user.id) {
        throw new RequestError('Sign in to continue with this RESCOM account.', 401);
      }
      active.user = result.user;
      setUser(result.user);
      connectionChanged('online');
      setLoadError('');
      const savedAt = stamp();
      setLastSync(savedAt);
      await renderData(active, result, ticket);
      if (context.current !== active || ticket !== refreshTicket.current) return;
      try {
        await saveSnapshot(active.user.id, space, result, savedAt);
        if (context.current === active && ticket === refreshTicket.current) await saveActive(active);
        setStorageReady(true);
      } catch {
        setStorageReady(false);
      }
    } catch (error) {
      if (ticket !== refreshTicket.current || context.current !== active) return;
      if (unavailable(error)) {
        connectionChanged('offline');
        setLoadError('');
        try {
          const snapshot = await readSnapshot(active.user.id, space);
          if (context.current !== active || ticket !== refreshTicket.current) return;
          if (snapshot) {
            setLastSync(snapshot.savedAt);
            await renderData(active, snapshot.data, ticket);
          } else if (show) {
            setLastSync('');
            setLoadError('Open this workspace online once to prepare its offline records.');
          }
        } catch {
          setStorageReady(false);
        }
      } else if (error instanceof RequestError && [401, 403].includes(error.status)) {
        connectionChanged('signed-out');
        setLoadError(error.message);
        setData(emptyWorkspace);
        base.current = emptyWorkspace;
        try { await clearActive(active.user); } catch { setStorageReady(false); }
      } else {
        setLoadError(error instanceof Error ? error.message : 'Could not load this workspace.');
      }
    } finally {
      if (ticket === refreshTicket.current) setLoading(false);
    }
  }, [connectionChanged, renderData]);

  const sync = useCallback(() => {
    if (runningSync.current) return runningSync.current;
    const active = context.current;
    if (!active || online.current !== 'online') return Promise.resolve();
    const run = async () => {
      if (context.current?.user.id !== active.user.id || online.current !== 'online') return;
      const pending = await listChanges(active.user.id);
      if (!pending.some(change => !change.error)) return;
      setSyncing(true);
      const blocked = blockedDependencies(pending);
      let saved = false;
      for (const change of pending) {
        if (context.current?.user.id !== active.user.id || online.current !== 'online') break;
        if (blocked.has(change.id) || change.dependencies.some(id => blocked.has(id))) {
          blocked.add(change.id);
          continue;
        }
        try {
          const result = await pushChange(change);
          const current = context.current;
          if (current?.user.id === active.user.id && current.space === change.space) {
            const previous = base.current[change.kind].find(r => r.id === change.recordId);
            const row = result.record || { ...previous, ...change.data, id: result.id, createdAt: previous?.createdAt || result.updatedAt, updatedAt: result.updatedAt };
            if (!previous || previous.updatedAt <= row.updatedAt) base.current = {
              ...base.current,
              [change.kind]: previous ? base.current[change.kind].map(r => r.id === row.id ? row : r) : [row, ...base.current[change.kind]],
            };
            // Keep a committed record visible even if the follow-up read loses its connection.
            try { await saveSnapshot(current.user.id, current.space, base.current, stamp()); } catch { setStorageReady(false); }
          }
          await removeChanges([change.id]);
          saved = true;
        } catch (error) {
          if (unavailable(error)) {
            connectionChanged('offline');
            break;
          }
          if (error instanceof RequestError && error.status === 401) {
            const current = context.current;
            if (current) await load(current.space);
            break;
          }
          await writeChange({ ...change, error: error instanceof Error ? error.message : 'Review this change and try again.' });
          blocked.add(change.id);
        }
      }
      const current = context.current;
      if (current?.user.id !== active.user.id || (online.current as Connection) === 'signed-out') return;
      if (saved && online.current === 'online') await load(current.space);
      else await renderData(current, base.current);
    };
    runningSync.current = (async (): Promise<void> => {
      if (navigator.locks) await navigator.locks.request('rescom-sync:' + active.user.id, run);
      else await run();
    })().catch(() => setStorageReady(false)).finally(() => {
      runningSync.current = null;
      setSyncing(false);
    });
    return runningSync.current;
  }, [connectionChanged, load, renderData]);

  const refresh = useCallback(() => {
    if (runningRefresh.current) return runningRefresh.current;
    const active = context.current;
    if (!active) return Promise.resolve();
    runningRefresh.current = (async () => {
      await load(active.space);
      if (context.current?.user.id === active.user.id && online.current === 'online') await sync();
    })().finally(() => { runningRefresh.current = null; });
    return runningRefresh.current;
  }, [load, sync]);

  const openWorkspace = useCallback(async (account: Staff, space: Space) => {
    const previous = context.current?.user;
    if (previous && previous.id !== account.id) {
      await clearActive(previous).catch(() => undefined);
      base.current = emptyWorkspace;
      setData(emptyWorkspace);
      setChanges([]);
      setLastSync('');
    }
    accessExpires.current = false;
    adopt({ user: account, space });
    try { localStorage.removeItem(localLock); } catch {}
    if (account.owner && space === 'training') {
      await request('seed', space, 'POST', {}).catch(() => undefined);
    }
    await load(space, true);
    if (online.current === 'online') await sync();
  }, [adopt, load, sync]);

  useEffect(() => {
    let disposed = false;
    async function start() {
      let cached: Awaited<ReturnType<typeof readActive>> = null;
      try { cached = await readActive(); } catch { setStorageReady(false); }
      if (disposed) return;
      try {
        if (localStorage.getItem(localLock) === 'staff') {
          await request('auth/logout', 'live', 'POST', {});
          localStorage.removeItem(localLock);
        }
        const auth = await request<{ user: Staff | null; emailReady: boolean; chatGPTAuth?: boolean }>('auth/me', 'live');
        if (disposed) return;
        setData(previous => ({ ...previous, emailReady: auth.emailReady, chatGPTAuth: auth.chatGPTAuth }));
        if (cached && cached.user.id !== auth.user?.id) await clearActive(cached.user).catch(() => undefined);
        if (auth.user) await openWorkspace(auth.user, auth.user.owner ? (cached?.user.id===auth.user.id ? cached.space : 'training') : 'live');
        else connectionChanged('signed-out');
      } catch (error) {
        if (disposed) return;
        const locked = localStorage.getItem(localLock);
        if (unavailable(error) && !locked && cached && cached.user.offlineUntil > Date.now()) {
          adopt(cached);
          connectionChanged('offline');
          await load(cached.space, true);
        } else {
          connectionChanged(unavailable(error) ? 'offline' : 'signed-out');
        }
      } finally {
        if (!disposed) {
          setBoot(false);
          setLoading(false);
        }
      }
    }
    void start();
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/rescom-offline.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => { if (!disposed) setOfflineReady(true); })
        .catch(() => {});
    }
    return () => { disposed = true; };
  }, [adopt, connectionChanged, load, openWorkspace]);

  useEffect(() => {
    function disconnected() {
      if (online.current !== 'signed-out') connectionChanged('offline');
    }
    function reconnect() {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
    }
    function check() {
      const active = context.current;
      if (online.current === 'offline' && active && active.user.offlineUntil <= Date.now() && !accessExpires.current) {
        accessExpires.current = true;
        setData(emptyWorkspace);
        base.current = emptyWorkspace;
        setLoadError('Sign in online to reopen your workspace. Your pending changes are saved on this device.');
        connectionChanged('signed-out');
      }
      if (online.current === 'offline' || accessExpires.current || changes.some(change => !change.error)) {
        reconnect();
      } else if (online.current === 'online' && active && navigator.onLine && document.visibilityState === 'visible' && !heartbeat.current) {
        heartbeat.current = true;
        void request('health', active.space).catch(error => {
          if (context.current === active && unavailable(error)) connectionChanged('offline');
        }).finally(() => { heartbeat.current = false; });
      }
    }
    window.addEventListener('offline', disconnected);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    const reconnectTimer = setInterval(check, 8000);
    const refreshTimer = refreshInterval ? setInterval(reconnect, refreshInterval * 1000) : undefined;
    return () => {
      clearInterval(reconnectTimer);
      clearInterval(refreshTimer);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
    };
  }, [changes, connectionChanged, refresh, refreshInterval]);

  const switchWorkspace = useCallback(async (space: Space) => {
    const active = context.current;
    if (!active || active.space === space || !active.user.owner) return;
    const next = { ...active, space };
    adopt(next);
    setData(emptyWorkspace);
    base.current = emptyWorkspace;
    setLastSync('');
    try { await saveActive(next); } catch { setStorageReady(false); }
    if (online.current !== 'signed-out') await load(space, true);
  }, [adopt, load]);

  async function save(kind: string, values: Record<string, any>, key?: string, retry?: Change) {
    const active = context.current;
    if (!active || online.current === 'signed-out' || (online.current === 'offline' && active.user.offlineUntil <= Date.now())) throw new Error('Sign in online to save changes.');
    if (!kinds.includes(kind as Kind)) {
      const result = await request(kind + (key ? '/' + encodeURIComponent(key) : ''), active.space, key ? 'PUT' : 'POST', values);
      await load(active.space);
      return { queued: false, message: result.message as string | undefined };
    }
    const { pendingChange, pendingSync, snapshot, ...payload } = values;
    const recordId = retry?.recordId || key || crypto.randomUUID();
    const related = kind === 'households'
      ? [data.centers.find(c => c.id === payload.centerId)?.pendingChange, data.events.find(e => e.id === payload.eventId)?.pendingChange]
      : kind === 'reports' ? [data.events.find(e => e.id === payload.eventId)?.pendingChange] : [];
    const after = key && pendingChange && pendingChange !== retry?.id ? pendingChange : undefined;
    const change: Change = {
      id: retry?.id || crypto.randomUUID(), owner: active.user.id, space: active.space, kind: kind as Kind,
      recordId, method: key ? 'PUT' : 'POST', data: payload, after,
      dependencies: [...new Set<string>([after, ...related].filter((id): id is string => Boolean(id)))],
      createdAt: retry?.createdAt || stamp(),
    };

    try {
      await writeChange(change);
    } catch {
      setStorageReady(false);
      if (online.current !== 'online') throw new Error('Offline storage is unavailable. Keep this form open and reconnect before saving.');
      try {
        await pushChange(change);
        await load(active.space);
        return { queued: false };
      } catch (error) {
        if (unavailable(error)) connectionChanged('offline');
        throw error;
      }
    }
    await renderData(active, base.current);
    if (online.current !== 'online') return { queued: true };
    await sync();

    const remaining = (await listChanges(active.user.id)).find(item => item.id === change.id);
    if (remaining?.error) {
      if (!retry) {
        await removeChanges([change.id]);
        await renderData(active, base.current);
      }
      throw new Error(remaining.error);
    }
    return { queued: Boolean(remaining) };
  }

  async function discard(change: Change) {
    const active = context.current;
    if (!active || active.user.id !== change.owner) return;
    const remove = [...blockedDependencies(await listChanges(active.user.id), [change.id])];
    await removeChanges(remove);
    await renderData(active, base.current);
  }

  async function signOut() {
    const active = context.current;
    if (!active) return;
    const native = Boolean(active.user.nativeSession);
    const shouldRedirect = native && online.current === 'online';
    ++refreshTicket.current;
    localStorage.setItem(localLock, native ? 'owner' : 'staff');
    adopt(null);
    connectionChanged('signed-out');
    setChanges([]);
    setData(emptyWorkspace);
    base.current = emptyWorkspace;
    await clearActive(active.user).catch(() => undefined);
    if (shouldRedirect) {
      window.location.assign('/signout-with-chatgpt?return_to=/');
      return;
    }
    if (!native && navigator.onLine) {
      await request('auth/logout', 'live', 'POST', {}).then(() => localStorage.removeItem(localLock)).catch(() => undefined);
    }
  }

  return {
    user, workspace, data, changes, boot, loading, connection, syncing, lastSync, loadError, storageReady, offlineReady,
    switchWorkspace, openWorkspace, refresh, save, discard, signOut,
  };
}
