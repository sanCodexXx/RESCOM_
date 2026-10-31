import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')).replace('import.meta.env.VITE_API_URL', 'undefined');
globalThis.localStorage = { getItem: () => 'test-token' };
const { api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('GET includes bearer token and parses server JSON', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:5000/api/centers');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { ok: true, json: async () => [{ center_id: 1 }] };
  };
  assert.deepEqual(await api.get('/centers'), [{ center_id: 1 }]);
});
test('HTTP status survives for session-expiry decisions', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Expired token' }) });
  await assert.rejects(api.get('/auth/me'), e => e.status === 401 && e.message === 'Expired token');
});
test('uncertain save is not automatically retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('Network failure'); };
  await assert.rejects(api.post('/incidents', { disaster_name: 'Sample' }), /outcome is unknown.*avoid duplicates/);
  assert.equal(calls, 1);
});
test('server timeout has a useful message', async () => {
  globalThis.fetch = async () => { const e = new Error(); e.name = 'AbortError'; throw e; };
  await assert.rejects(api.get('/centers'), /too long to respond/);
});
