import { isLocalId } from './fieldData.js';
import { flushFieldWrites, prepareOffline, readFieldData, recoverOfflineSaves, restoreOffline, retryFieldWrites, saveFieldChange, warmOffline } from './sync.js';

const BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('rescom_token');
}

async function request(path, {
  method = 'GET', body, auth = true, formData = false, token = getToken(),
  headers: extraHeaders, timeoutMs = 45000
} = {}) {
  const headers = { ...extraHeaders };
  if (!formData) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  let data = null;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method, headers, signal: controller.signal,
      body: formData ? body : (body ? JSON.stringify(body) : undefined)
    });
    try { data = await res.json(); }
    catch (cause) { if (cause.name !== 'SyntaxError') throw cause; }
  } catch (cause) {
    const mutation = method !== 'GET';
    const message = cause.name === 'AbortError'
      ? 'The server took too long to respond.'
      : 'Could not reach the server. Check your internet connection.';
    const error = new Error(message + (mutation ? ' The save outcome is unknown. Refresh the records before trying again to avoid duplicates.' : ' Please try again.'), { cause });
    error.network = true;
    throw error;
  } finally { clearTimeout(timeout); }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

// Builds a multipart FormData body from a plain object, skipping empty
// values. `File`/`Blob` values (e.g. an <input type="file"> pick) are
// attached as-is.
function toFormData(obj) {
  const fd = new FormData();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    fd.append(k, v);
  });
  return fd;
}

const save = (path, options) => saveFieldChange(request, path, options);

export const api = {
  get: path => readFieldData(request, path),
  post: (path, body, opts) => save(path, { method: 'POST', body, ...opts }),
  put: (path, body) => save(path, { method: 'PUT', body }),
  patch: (path, body) => save(path, { method: 'PATCH', body }),
  del: async path => {
    if (path.split('/').some(isLocalId)) throw new Error('Sync this record before deleting it.');
    if (globalThis.navigator?.onLine === false) throw new Error('Connect to RESCOM to delete records.');
    return request(path, { method: 'DELETE' });
  },
  postForm: (path, obj) => save(path, { method: 'POST', body: toFormData(obj), formData: true }),
  putForm: (path, obj) => save(path, { method: 'PUT', body: toFormData(obj), formData: true }),
  getSession: (token, timeoutMs) => request('/auth/me', { token, timeoutMs }),
  prepareOffline: () => prepareOffline(BASE_URL),
  warmOffline: () => warmOffline(request),
  recoverOfflineSaves: passphrase => recoverOfflineSaves(BASE_URL, passphrase),
  restoreOffline: () => restoreOffline(BASE_URL),
  syncOffline: () => flushFieldWrites(request),
  retryOffline: () => retryFieldWrites(request),
  // Downloads a binary response (PDF, etc.) as a Blob, with auth header.
  download: async (path) => {
    if (globalThis.navigator?.onLine === false) throw new Error('Connect to RESCOM to download reports.');
    const token = getToken();
    const res = await fetch(`${BASE_URL}/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return res.blob();
  }
};

export function savedMessage(result, normal) {
  return result?.queued ? 'Saved on this device. Waiting to sync.' : normal;
}

export { BASE_URL };
