import type { Kind, Row } from './domain';

export type Space = 'training' | 'live';
export type Staff = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'field';
  centerId: string;
  owner: boolean;
  nativeSession?: boolean;
  offlineUntil: number;
};
export type Workspace = Record<Kind, Row[]> & {
  personnel: Row[];
  activity: Row[];
  emailReady: boolean;
  chatGPTAuth?: boolean;
  user?: Staff;
};
export const emptyWorkspace: Workspace = {
  centers: [], households: [], events: [], reports: [], personnel: [], activity: [], emailReady: false,
};

export type Change = {
  id: string;
  owner: string;
  space: Space;
  kind: Kind;
  recordId: string;
  method: 'POST' | 'PUT';
  data: Record<string, any>;
  after?: string;
  dependencies: string[];
  createdAt: string;
  error?: string;
};
type Active = { user: Staff; space: Space };
type Snapshot = { data: Workspace; savedAt: string };
type Sealed = { iv: Uint8Array<ArrayBuffer>; bytes: ArrayBuffer };
type StoredChange = { owner: string; value: Sealed };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let opening: Promise<IDBDatabase> | undefined;
let keyPromise: Promise<CryptoKey> | undefined;

function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('rescom-workspace', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('changes').createIndex('owner', 'owner');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other RESCOM tabs and try again.'));
  });
  return opening;
}

async function store<T>(
  name: 'state' | 'changes',
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = operation(transaction.objectStore(name));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error || request.error);
  });
}

function browserKey() {
  keyPromise ??= (async () => {
    const existing = await store<CryptoKey | undefined>('state', 'readonly', s => s.get('encryption-key'));
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      await store('state', 'readwrite', s => s.add(key, 'encryption-key'));
      return key;
    } catch (error) {
      const winner = await store<CryptoKey | undefined>('state', 'readonly', s => s.get('encryption-key'));
      if (!winner) throw error;
      return winner;
    }
  })();
  return keyPromise;
}

async function seal(value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await browserKey(), encoder.encode(JSON.stringify(value)));
  return { iv, bytes };
}

async function unseal<T>(value: Sealed): Promise<T> {
  return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.iv }, await browserKey(), value.bytes)));
}

export async function saveActive(active: Active) {
  const value = await seal(active);
  await store('state', 'readwrite', s => s.put(value, 'active'));
}

export async function readActive(): Promise<Active | null> {
  const value = await store<Sealed | undefined>('state', 'readonly', s => s.get('active'));
  return value ? unseal<Active>(value) : null;
}

export async function clearActive(user?: Staff | null) {
  const active = await readActive();
  if (user && active && user.id !== active.user.id) return;
  const owner = user?.id || active?.user.id;
  await store('state', 'readwrite', s => s.delete('active'));
  if (owner) {
    await Promise.all((['training', 'live'] as const).map(space =>
      store('state', 'readwrite', s => s.delete('snapshot:' + owner + ':' + space)),
    ));
  }
}

export async function saveSnapshot(owner: string, space: Space, data: Workspace, savedAt: string) {
  const value = await seal({ data: { ...data, personnel: [], activity: [] }, savedAt });
  await store('state', 'readwrite', s => s.put(value, 'snapshot:' + owner + ':' + space));
}

export async function readSnapshot(owner: string, space: Space): Promise<Snapshot | null> {
  const value = await store<Sealed | undefined>('state', 'readonly', s => s.get('snapshot:' + owner + ':' + space));
  return value ? unseal<Snapshot>(value) : null;
}

export async function listChanges(owner: string): Promise<Change[]> {
  const changes = await store<StoredChange[]>('changes', 'readonly', s => s.index('owner').getAll(owner));
  const decoded = await Promise.all(changes.map(change => unseal<Change>(change.value)));
  decoded.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byId = new Map(decoded.map(change => [change.id, change]));
  const visited = new Set<string>();
  const ordered: Change[] = [];
  function visit(change: Change) {
    if (visited.has(change.id)) return;
    visited.add(change.id);
    for (const id of change.dependencies) {
      const previous = byId.get(id);
      if (previous) visit(previous);
    }
    ordered.push(change);
  }
  decoded.forEach(visit);
  return ordered;
}

export async function writeChange(change: Change) {
  const value = await seal(change);
  await store('changes', 'readwrite', s => s.put({ owner: change.owner, value }, change.id));
}

export async function removeChanges(ids: string[]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('changes', 'readwrite');
    const changes = transaction.objectStore('changes');
    for (const id of ids) changes.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

export function blockedDependencies(changes: Change[], failed = changes.filter(c => c.error).map(c => c.id)) {
  const blocked = new Set(failed);
  for (const change of changes) {
    if (change.dependencies.some(id => blocked.has(id))) blocked.add(change.id);
  }
  return blocked;
}

export function applyChanges(data: Workspace, changes: Change[], space: Space): Workspace {
  const next = { ...data };
  const blocked = blockedDependencies(changes);
  for (const change of changes) {
    if (change.space !== space || blocked.has(change.id)) continue;
    const records = next[change.kind];
    const existing = records.find(r => r.id === change.recordId);
    const row: Row = {
      ...existing,
      ...change.data,
      id: change.recordId,
      createdAt: existing?.createdAt || change.createdAt,
      updatedAt: existing?.updatedAt || change.createdAt,
      pendingChange: change.id,
      pendingSync: true,
    };
    next[change.kind] = existing ? records.map(r => r.id === row.id ? row : r) : [row, ...records];
  }
  return next;
}
