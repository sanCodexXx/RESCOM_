import { enrollDevice, prepareShell, readDevice, readQueue, readWorkspace, removeEntry, unlockDevice, updateWorkspace } from './offline.js';
import { acceptFieldWrite, FIELD_VIEWS, fieldSave, fieldView, hasLocalReferences, projectedViews, resolveChange } from './fieldData.js';
import { registrationPayload } from './registration.js';

const listeners = new Set();
let active;
let accessRevision = 0;
let verified;
let reachable = true;
let syncing = false;
let status = { reachable: true, unlocked: false, pending: 0, review: [], syncing: false, needsSignIn: false };
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
    needsSignIn: Boolean(active && !authenticated(active))
  };
  listeners.forEach(notify => notify());
}

export function subscribeSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const syncStatus = () => status;
export const isPrepared = () => localStorage.getItem('rescom_offline_ready') === '1';
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

async function changeWorkspace(session, change) {
  const workspace = await updateWorkspace(session.vault, change);
  session.workspace = workspace;
  if (active === session) publish();
  return workspace;
}

async function seedWorkspace(request, apiOrigin, user) {
  const token = currentToken();
  if (!user || verified?.user.user_id !== user.user_id || verified.token !== token || !token) {
    throw new Error('Sign in while connected to prepare RESCOM for offline use.');
  }
  await prepareShell();
  const views = Object.fromEntries(await Promise.all(
    FIELD_VIEWS.map(async path => [path, await request(path, { token })])
  ));
  if (token !== currentToken()) throw new Error('Sign in with the same account to prepare this browser.');
  return { user: deviceIdentity(user), apiOrigin, views, queue: [], aliases: {} };
}

export async function openOffline(request, apiOrigin, user, passphrase, confirmation) {
  const revision = accessRevision;
  const profile = await readDevice();
  let session;
  if (profile) {
    if (user && user.user_id !== profile.ownerId) {
      throw new Error('This browser is prepared for another account. Use a separate browser profile.');
    }
    session = await unlockDevice(profile, passphrase);
    if (!session.workspace) {
      const workspace = await seedWorkspace(request, apiOrigin, user);
      const legacy = await readQueue(session.vault);
      workspace.queue = legacy.map(entry => ({
        id: entry.id, legacy: true, kind: 'registration', label: 'Evacuee registration',
        path: '/evacuees/offline-registrations', method: 'POST', files: [],
        body: {
          ...registrationPayload(entry.form), owner_id: profile.ownerId, submission_id: entry.id,
          captured_at: new Date(entry.createdAt).toISOString()
        },
        createdAt: new Date(entry.createdAt).toISOString(), review: entry.review
      }));
      session.workspace = await updateWorkspace(session.vault, current => current || workspace);
    }
  } else {
    if (passphrase.trim().length < 16 || passphrase !== confirmation) {
      throw new Error('Enter the same offline passphrase of at least 16 characters twice.');
    }
    const workspace = await seedWorkspace(request, apiOrigin, user);
    session = await enrollDevice(user.user_id, passphrase, workspace);
  }
  if (session.workspace.apiOrigin !== apiOrigin) {
    throw new Error('This browser was prepared for a different RESCOM server.');
  }
  if (revision !== accessRevision || (verified && verified.user.user_id !== session.vault.ownerId)) {
    throw new Error('Sign in with the account that prepared this browser.');
  }
  session.revision = 0;
  active = session;
  localStorage.setItem('rescom_offline_ready', '1');
  publish();
  return session.workspace.user;
}

function cachedView(session, path) {
  const data = projectedViews(session.workspace)[path];
  if (data === undefined) {
    throw Object.assign(new Error('Connect to RESCOM to load this view.'), { code: 'OFFLINE_VIEW' });
  }
  return data;
}

export async function readFieldData(request, path) {
  const session = active;
  if (!session || !fieldView(path)) return request(path);
  if (!canSend(session) || session.workspace.queue.some(change => !change.review)) return cachedView(session, path);
  const revision = session.revision;
  try {
    const data = await request(path, { token: verified.token });
    if (active !== session) throw new Error('Unlock this account’s offline data to open this view.');
    if (revision !== session.revision || !authenticated(session)) return cachedView(session, path);
    if (data != null) {
      await changeWorkspace(session, workspace => {
        if (revision !== session.revision) return workspace;
        const views = { ...workspace.views };
        delete views[path];
        views[path] = data;
        const extra = Object.keys(views).filter(key => !FIELD_VIEWS.includes(key));
        for (const key of extra.slice(0, Math.max(0, extra.length - 12))) delete views[key];
        return { ...workspace, views };
      }).catch(() => {});
    }
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
          token: verified.token, headers, timeoutMs: 12000
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

export function saveFieldChange(request, path, options) {
  const session = active;
  const descriptor = fieldSave(options.method, path);
  if (!session || !descriptor) return request(path, options);
  const key = options.formData ? options.body : JSON.stringify([path, options.method, options.body]);
  if (savesInFlight.has(key)) return savesInFlight.get(key);
  const save = (async () => {
    const change = await createChange(path, options, descriptor, session);
    const persist = () => changeWorkspace(session, workspace => {
      if (active !== session) throw new Error('Unlock this account’s offline data before saving.');
      session.revision++;
      return { ...workspace, queue: [...workspace.queue, change] };
    });
    if (!canSend(session)) {
      await persist();
      return { queued: true };
    }
    return navigator.locks.request('rescom-field-sync', async () => {
      await persist();
      return (await drain(request, session, change.id)) || { queued: true };
    });
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
