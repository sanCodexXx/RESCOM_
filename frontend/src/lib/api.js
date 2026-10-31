const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('rescom_token');
}

async function request(path, { method = 'GET', body, auth = true, formData = false } = {}) {
  const headers = {};
  if (!formData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method, headers, signal: controller.signal,
      body: formData ? body : (body ? JSON.stringify(body) : undefined)
    });
  } catch (cause) {
    const mutation = method !== 'GET';
    const message = cause.name === 'AbortError'
      ? 'The server took too long to respond.'
      : 'Could not reach the server. Check your internet connection.';
    throw new Error(message + (mutation ? ' The save outcome is unknown. Refresh the records before trying again to avoid duplicates.' : ' Please try again.'), { cause });
  } finally { clearTimeout(timeout); }

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
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

export const api = {
  get: (path) => request(path),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, obj) => request(path, { method: 'POST', body: toFormData(obj), formData: true }),
  putForm: (path, obj) => request(path, { method: 'PUT', body: toFormData(obj), formData: true }),
  // Downloads a binary response (PDF, etc.) as a Blob, with auth header.
  download: async (path) => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return res.blob();
  }
};

export { BASE_URL };
