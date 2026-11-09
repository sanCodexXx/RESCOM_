const encoder = new TextEncoder();
const decoder = new TextDecoder();
let connection;

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('rescom-field-device', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('device');
        request.result.createObjectStore('registrations', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function stored(name, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = action(transaction.objectStore(name));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error || new Error('The device save was interrupted.'));
  });
}

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function seal(vault, id, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`${vault.ownerId}:${id}`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, vault.key, encoder.encode(JSON.stringify(value)));
  return { iv, ciphertext };
}

async function unseal(vault, id, value) {
  const additionalData = encoder.encode(`${vault.ownerId}:${id}`);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.iv, additionalData }, vault.key, value.ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

export function readDevice() {
  return stored('device', 'readonly', store => store.get('profile'));
}

export async function prepareShell() {
  if (!import.meta.env.PROD || !navigator.serviceWorker || !navigator.locks || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error('Prepare this device using the RESCOM production build over HTTPS or localhost in an up-to-date browser.');
  }
  await navigator.serviceWorker.register('/rescom-sw.js', { updateViaCache: 'none' });
  if (navigator.serviceWorker.controller) return;

  await new Promise((resolve, reject) => {
    const workers = navigator.serviceWorker;
    const done = () => {
      if (!workers.controller) return;
      clearTimeout(timeout);
      workers.removeEventListener('controllerchange', done);
      resolve();
    };
    const timeout = setTimeout(() => {
      workers.removeEventListener('controllerchange', done);
      reject(new Error('The offline screen is still downloading. Keep RESCOM open and try preparing again.'));
    }, 45000);
    workers.addEventListener('controllerchange', done);
    done();
  });
}

export async function enrollDevice(ownerId, passphrase, workspace) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const vault = { ownerId, key: await deriveKey(passphrase, salt) };
  const profile = { ownerId, salt, workspace: await seal(vault, 'workspace', workspace) };
  await stored('device', 'readwrite', store => store.add(profile, 'profile'));
  navigator.storage?.persist?.().catch(() => {});
  return { vault, workspace };
}

export async function unlockDevice(profile, passphrase) {
  const vault = { ownerId: profile.ownerId, key: await deriveKey(passphrase, profile.salt) };
  try {
    if (profile.workspace) return { vault, workspace: await unseal(vault, 'workspace', profile.workspace) };
    await unseal(vault, 'catalog', profile.catalog);
    return { vault, workspace: null };
  } catch {
    throw new Error('The offline passphrase did not unlock this device.');
  }
}

export async function readWorkspace(vault) {
  const profile = await readDevice();
  if (profile?.ownerId !== vault.ownerId) throw new Error('This browser is prepared for another account.');
  return profile.workspace ? unseal(vault, 'workspace', profile.workspace) : null;
}

export function updateWorkspace(vault, change) {
  return navigator.locks.request('rescom-workspace', async () => {
    const profile = await readDevice();
    if (profile?.ownerId !== vault.ownerId) throw new Error('This browser is prepared for another account.');
    const current = profile.workspace ? await unseal(vault, 'workspace', profile.workspace) : null;
    const workspace = change(current);
    const encrypted = await seal(vault, 'workspace', workspace);
    await stored('device', 'readwrite', store => store.put({ ...profile, workspace: encrypted }, 'profile'));
    return workspace;
  });
}

export async function readQueue(vault) {
  const rows = await stored('registrations', 'readonly', store => store.getAll());
  const entries = await Promise.all(rows.map(row => unseal(vault, row.id, row)));
  return entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function removeEntry(id) {
  return stored('registrations', 'readwrite', store => store.delete(id));
}
