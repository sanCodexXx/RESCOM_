import {
  enrollDevice, loginFingerprint, openSavedDevice, prepareShell, readDevice, readQueue, readWorkspace,
  rememberDeviceLogin, removeEntry, unlockLegacyDevice, updateWorkspace
} from './offline.js';
import { acceptFieldWrite, FIELD_VIEWS, fieldSave, fieldView, hasLocalReferences, projectedViews, resolveChange } from './fieldData.js';
import { registrationPayload } from './registration.js';

const listeners = new Set();
let active;
let accessRevision = 0;
let verified;
let preparing;
let warming;
let shellPreparation;
let reachable = true;
let syncing = false;
let status = { reachable: true, unlocked: false, pending: 0, review: [], syncing: false, needsSignIn: false, hasPreviousSaves: false };
const savesInFlight = new Map();

function currentToken() {
  return localStorage.getItem('rescom_token');
}

function authenticated(session) {
  return Boolean(session && verified?.user.user_id === session.vault.ownerId && verified.token === currentToken());
}

function canSend(session) {
  return active === session && reachable && navigator.onLine && authenticated(session);
}

function publish() {
  const queue = active?.workspace.queue || [];
  status = {
    reachable,
    unlocked: Boolean(active),
    pending: queue.filter(change => !change.review).length,
    review: queue.filter(change => change.review).map(({ id, label, review }) => ({ id, label, review })),
    syncing,
    hasPreviousSaves: Boolean(active?.hasPreviousSaves),
    needsSignIn: Boolean(active && !authenticated(active))
  };
  listeners.forEach(notify => notify());
}

export function subscribeSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const syncStatus = () => status;
export const isPrepared = () => ['1', 'device'].includes(localStorage.getItem('rescom_offline_ready'));
export const resolveFieldId = id => active?.workspace.aliases[id] ?? id;
export const refreshRecords = () => window.dispatchEvent(new Event('rescom:records-updated'));

function deviceIdentity(user) {
  const { user_id, role, first_name, last_name, username } = user;
  return { user_id, role, first_name, last_name, username };
}

export function setVerifiedUser(user, token = currentToken()) {
  verified = user ? { user, token } : undefined;
  if (user && active && user.user_id !== active.vault.ownerId) active = undefined;
  if (user && active) {
    const session = active;
    const identity = deviceIdentity(user);
    if (JSON.stringify(identity) !== JSON.stringify(session.workspace.user)) {
      changeWorkspace(session, workspace => ({ ...workspace, user: identity })).catch(() => {});
    }
  }
  publish();
}

export function lockOffline() {
  accessRevision++;
  active = undefined;
  publish();
}

export function setReachable(online) {
  if (reachable !== online) {
    reachable = online;
    publish();
  }
}

async function changeWorkspace(session, change, options) {
  const workspace = await updateWorkspace(session.vault, change, options);
  session.workspace = workspace;
  if (active === session) publish();
  return workspace;
}

function verifiedAccount(ownerId, token) {
  return Boolean(token && verified?.user.user_id === ownerId && verified.token === token && token === currentToken());
}

function checkAccess(ownerId, token, revision) {
  if (revision !== accessRevision || token !== currentToken() || (verified && verified.user.user_id !== ownerId)) {
    throw new Error('Sign in with the account that prepared this browser.');
  }
}

function activate(session, apiOrigin, token, revision) {
  if (session.workspace.apiOrigin !== apiOrigin) {
    throw new Error('This browser was prepared for a different RESCOM server.');
  }
  checkAccess(session.vault.ownerId, token, revision);
  if (active?.vault.ownerId !== session.vault.ownerId) {
    session.revision = 0;
    active = session;
  }
  active.token = token;
  localStorage.setItem('rescom_offline_ready', 'device');
  publish();
  return active.workspace.user;
}

export async function restoreOffline(apiOrigin, savedProfile) {
  const token = currentToken();
  if (!token || (!savedProfile && !isPrepared())) return null;
  const revision = accessRevision;
  const profile = savedProfile || await readDevice();
  if (!profile?.key) return null;

  const confirmed = verifiedAccount(profile.ownerId, token);
  const proof = await loginFingerprint(token);
  if (!confirmed && profile.loginProof !== proof) return null;
  const saved = active?.vault.ownerId === profile.ownerId ? active : await openSavedDevice(profile);
  if (saved.workspace.apiOrigin !== apiOrigin) return null;
  if (confirmed && profile.loginProof !== proof) {
    await rememberDeviceLogin(saved.vault, proof, () => checkAccess(profile.ownerId, token, revision));
  }
  return activate(saved, apiOrigin, token, revision);
}

export function prepareOffline(apiOrigin) {
  const { user, token } = verified || {};
  if (!user || !verifiedAccount(user.user_id, token)) return Promise.resolve(null);
  if (preparing?.token === token) return preparing.promise;
  if (active?.token === token && active.workspace.apiOrigin === apiOrigin) return Promise.resolve(active.workspace.user);
  if (!import.meta.env?.PROD || !navigator.serviceWorker || !navigator.locks || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    return Promise.resolve(null);
  }
  const revision = accessRevision;
  const promise = (async () => {
    let profile = await readDevice();
    if (profile && profile.ownerId !== user.user_id) return null;
    if (!profile?.key) {
      const proof = await loginFingerprint(token);
      const workspace = { user: deviceIdentity(user), apiOrigin, views: {}, queue: [], aliases: {} };
      profile = await enrollDevice(user.user_id, workspace, proof, () => {
        checkAccess(user.user_id, token, revision);
        if (!verifiedAccount(user.user_id, token)) throw new Error('Sign in to save on this browser.');
      });
    }
    checkAccess(user.user_id, token, revision);
    return restoreOffline(apiOrigin, profile);
  })().finally(() => {
    if (preparing?.promise === promise) preparing = undefined;
  });
  preparing = { token, promise };
  return promise;
}

export function preloadOfflineShell() {
  if (!shellPreparation) {
    shellPreparation = prepareShell().catch(error => {
      shellPreparation = undefined;
      throw error;
    });
  }
  return shellPreparation;
}

export function warmOffline(request) {
  const session = active;
  if (!session || !canSend(session)) return Promise.resolve();
  if (warming?.session === session) return warming.promise;

  const paths = FIELD_VIEWS.filter(path => session.workspace.views[path] === undefined);
  const shell = preloadOfflineShell();
  if (!paths.length) return shell.catch(() => {});
  const records = (async () => {
    const revision = session.revision;
    const results = await Promise.allSettled(paths.map(path => request(path, { token: verified.token, timeoutMs: 6000 })));
    if (!canSend(session) || revision !== session.revision) return;
    const available = paths.flatMap((path, index) => {
      const result = results[index];
      return result.status === 'fulfilled' && result.value != null ? [[path, result.value]] : [];
    });
    if (!available.length) return;
    await changeWorkspace(session, workspace => {
      if (revision !== session.revision || !canSend(session)) return workspace;
      const missing = available.filter(([path]) => workspace.views[path] === undefined);
      return { ...workspace, views: { ...Object.fromEntries(missing), ...workspace.views } };
    });
    if (active === session && !reachable) refreshRecords();
  })();
  const promise = Promise.allSettled([shell, records]).finally(() => {
    if (warming?.promise === promise) warming = undefined;
  });
  warming = { session, promise };
  return promise;
}

export async function recoverOfflineSaves(apiOrigin, passphrase) {
  const session = active;
  if (!canSend(session)) throw new Error('Sign in while connected to recover previous saves.');
  const { previous } = await readDevice();
  if (!previous) {
    session.hasPreviousSaves = false;
    if (active === session) publish();
    return;
  }
  const old = await unlockLegacyDevice(previous, passphrase);
  if (old.workspace && old.workspace.apiOrigin !== apiOrigin) {
    throw new Error('These saves belong to a different RESCOM server.');
  }
  await preloadOfflineShell();
  const queue = old.workspace?.queue ?? (await readQueue(old.vault)).map(entry => ({
    id: entry.id, legacy: true, kind: 'registration', label: 'Evacuee registration',
    path: '/evacuees/offline-registrations', method: 'POST', files: [],
    body: {
      ...registrationPayload(entry.form), owner_id: previous.ownerId, submission_id: entry.id,
      captured_at: new Date(entry.createdAt).toISOString()
    },
    createdAt: new Date(entry.createdAt).toISOString(), review: entry.review
  }));
  await changeWorkspace(session, workspace => {
    if (!canSend(session)) throw new Error('Sign in while connected to recover previous saves.');
    session.revision++;
    const existing = new Set(workspace.queue.map(entry => entry.id));
    return {
      ...workspace,
      aliases: { ...old.workspace?.aliases, ...workspace.aliases },
      queue: [...queue.filter(entry => !existing.has(entry.id)), ...workspace.queue]
    };
  }, { recoverPrevious: true });
  session.hasPreviousSaves = false;
  if (active === session) {
    publish();
    refreshRecords();
  }
}

async function waitForPreparation() {
  if (active || !preparing) return;
  const { token, promise } = preparing;
  await promise.catch(() => {});
  if (token !== currentToken()) throw new Error('Your RESCOM session changed. Sign in again.');
}

export async function forgetCachedReport(reportId) {
  const session = active;
  if (!session) return;
  session.revision++;
  await changeWorkspace(session, workspace => {
    const views = { ...workspace.views };
    if (views['/dromic']) views['/dromic'] = views['/dromic'].filter(report => String(report.report_id) !== String(reportId));
    delete views[`/dromic/${reportId}/summary`];
    return { ...workspace, views };
  });
}

function cachedView(session, path) {
  const data = projectedViews(session.workspace)[path];
  if (data === undefined) {
    throw Object.assign(new Error('Connect to RESCOM to load this view.'), { code: 'OFFLINE_VIEW' });
  }
  return data;
}

export async function readFieldData(request, path) {
  if (!fieldView(path)) return request(path);
  await waitForPreparation();
  const session = active;
  if (!session) return request(path);
  if (!canSend(session)) return cachedView(session, path);
  if (session.workspace.queue.some(change => !change.review) && projectedViews(session.workspace)[path] !== undefined) {
    return cachedView(session, path);
  }
  const revision = session.revision;
  try {
    const data = await request(path, { token: verified.token, timeoutMs: 6000 });
    if (active !== session) throw new Error('Your RESCOM session changed. Sign in again.');
    if (revision !== session.revision || !authenticated(session)) return cachedView(session, path);
    if (data == null) {
      setReachable(false);
      return cachedView(session, path);
    }
    await changeWorkspace(session, workspace => {
      if (revision !== session.revision) return workspace;
      const views = { ...workspace.views };
      delete views[path];
      views[path] = data;
      const extra = Object.keys(views).filter(key => !FIELD_VIEWS.includes(key));
      for (const key of extra.slice(0, Math.max(0, extra.length - 12))) delete views[key];
      return { ...workspace, views };
    }).catch(() => {});
    return revision === session.revision ? data : cachedView(session, path);
  } catch (error) {
    if (active === session && (error.network || error.status >= 500 || error.status === 401)) {
      if (error.status === 401) setVerifiedUser(null);
      else setReachable(false);
      return cachedView(session, path);
    }
    throw error;
  }
}

function encodeFile(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Image is too large (max 8 MB).');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(new Error('The device could not read the image.'));
    reader.readAsDataURL(file);
  });
}

async function createChange(path, options, descriptor, session) {
  const body = {};
  const files = [];
  if (options.formData) {
    for (const [name, value] of options.body.entries()) {
      if (typeof value === 'string') body[name] = value;
      else files.push({ name, filename: value.name, type: value.type, bytes: await encodeFile(value) });
    }
  } else Object.assign(body, options.body);
  const createdAt = new Date().toISOString();
  const name = body.disaster_name || body.center_name || body.evacuee?.first_name || body.first_name;
  const label = name ? `${descriptor.label} · ${name}` : descriptor.label;
  return {
    ...descriptor, label, id: crypto.randomUUID(), method: options.method, path, body, files,
    formData: Boolean(options.formData), createdAt,
    capturedAt: canSend(session) ? null : createdAt
  };
}

function requestBody(change) {
  if (!change.formData) return change.body;
  const data = new FormData();
  for (const [name, value] of Object.entries(change.body)) data.append(name, value);
  for (const file of change.files) {
    const bytes = Uint8Array.from(atob(file.bytes), character => character.charCodeAt(0));
    data.append(file.name, new Blob([bytes], { type: file.type }), file.filename);
  }
  return data;
}

async function markReview(session, id, message) {
  await changeWorkspace(session, workspace => ({
    ...workspace, queue: workspace.queue.map(change => change.id === id ? { ...change, review: message } : change)
  }));
}

async function drain(request, session, target) {
  const previousSync = session.workspace.lastConfirmed;
  session.workspace = await readWorkspace(session.vault);
  const syncedInAnotherTab = session.workspace.lastConfirmed !== previousSync;
  if (!session.workspace.queue.some(change => !change.review)) {
    publish();
    if (syncedInAnotherTab) refreshRecords();
    return;
  }
  let confirmed = 0;
  let response;
  syncing = true;
  publish();
  try {
    while (canSend(session)) {
      session.workspace = await readWorkspace(session.vault);
      const saved = session.workspace.queue.find(change => !change.review);
      if (!saved) break;
      const change = resolveChange(saved, session.workspace.aliases);
      if (hasLocalReferences(change)) {
        await markReview(session, saved.id, 'A related record must sync first. Resolve it, then retry this change.');
        continue;
      }
      const headers = change.legacy ? {} : {
        'Idempotency-Key': change.id,
        'X-RESCOM-Owner': String(session.vault.ownerId),
        ...(change.capturedAt ? { 'X-RESCOM-Captured-At': change.capturedAt } : {})
      };
      let data;
      try {
        data = await request(change.path, {
          method: change.method, body: requestBody(change), formData: change.formData,
          token: verified.token, headers, timeoutMs: change.formData ? 20000 : 7000
        });
      } catch (error) {
        if (error.network || error.status >= 500 || error.status === 429) {
          setReachable(false);
          break;
        }
        if (error.status === 401) {
          setVerifiedUser(null);
          break;
        }
        if (saved.id === target) {
          await changeWorkspace(session, workspace => ({
            ...workspace, queue: workspace.queue.filter(entry => entry.id !== saved.id)
          }));
          throw error;
        }
        await markReview(session, saved.id, error.message);
        continue;
      }
      if (!data || (change.legacy && data.submission_id !== change.id)) {
        setReachable(false);
        break;
      }
      try {
        session.revision++;
        await changeWorkspace(session, workspace => {
          const confirmedWorkspace = change.legacy
            ? { ...workspace, queue: workspace.queue.filter(entry => entry.id !== saved.id) }
            : acceptFieldWrite(workspace, saved, data);
          return { ...confirmedWorkspace, lastConfirmed: saved.id };
        });
      } catch {
        setReachable(false);
        break;
      }
      if (change.legacy) await removeEntry(saved.id).catch(() => {});
      confirmed++;
      if (saved.id === target) response = data;
    }
  } finally {
    syncing = false;
    publish();
    if (syncedInAnotherTab || confirmed > (response ? 1 : 0)) refreshRecords();
  }
  return response;
}

export function flushFieldWrites(request) {
  const session = active;
  if (!session || !canSend(session)) return Promise.resolve();
  return navigator.locks.request('rescom-field-sync', { ifAvailable: true }, lock => (
    lock && canSend(session) ? drain(request, session) : undefined
  ));
}

export async function saveFieldChange(request, path, options) {
  const descriptor = fieldSave(options.method, path);
  if (!descriptor) return request(path, options);
  await waitForPreparation();
  const session = active;
  if (!session) return request(path, options);
  const key = options.formData ? options.body : JSON.stringify([path, options.method, options.body]);
  if (savesInFlight.has(key)) return savesInFlight.get(key);
  const save = (async () => {
    const change = await createChange(path, options, descriptor, session);
    await changeWorkspace(session, workspace => {
      if (active !== session) throw new Error('Your RESCOM session changed. Sign in again.');
      session.revision++;
      return { ...workspace, queue: [...workspace.queue, change] };
    });
    if (!canSend(session)) return { queued: true };
    const response = await navigator.locks.request('rescom-field-sync', { ifAvailable: true }, lock => (
      lock && canSend(session) ? drain(request, session, change.id) : undefined
    ));
    return response || { queued: true };
  })().finally(() => savesInFlight.delete(key));
  savesInFlight.set(key, save);
  return save;
}

export async function retryFieldWrites(request) {
  if (!active) return;
  const session = active;
  await changeWorkspace(session, workspace => ({
    ...workspace, queue: workspace.queue.map(change => ({ ...change, review: undefined }))
  }));
  await flushFieldWrites(request);
}

export async function discardReviewedWrite(id) {
  if (!active) return;
  const session = active;
  await navigator.locks.request('rescom-field-sync', async () => {
    const workspace = await readWorkspace(session.vault);
    const item = workspace.queue.find(change => change.id === id && change.review);
    if (!item) return;
    await changeWorkspace(session, current => ({
      ...current, queue: current.queue.filter(change => change.id !== id)
    }));
    if (item.legacy) await removeEntry(id).catch(() => {});
  });
  refreshRecords();
}
