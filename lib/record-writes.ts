import { ApiError, db, hash } from './server';
import type { Kind } from './domain';

type Receipt = {
  request_hash: string;
  saved_at: string;
};

async function receipt(operationId: string, accountId: string, space: string, kind: Kind, recordId: string) {
  return db().prepare(
    'SELECT request_hash,saved_at FROM record_writes WHERE id=? AND account_id=? AND space=? AND kind=? AND record_id=?',
  ).bind(operationId, accountId, space, kind, recordId).first<Receipt>();
}

export async function readWrite(request: Request, raw: unknown, accountId: string, space: string, kind: Kind, key?: string) {
  const operationId = request.headers.get('X-Rescom-Operation');
  if (!operationId) return null;

  const recordId = key || request.headers.get('X-Rescom-Record');
  const predecessor = request.headers.get('X-Rescom-After');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(operationId) || !recordId || (!key && !uuid.test(recordId)) || (predecessor && !uuid.test(predecessor))) {
    throw new ApiError('Invalid saved change.');
  }
  if (request.headers.get('X-Rescom-Account') !== accountId) {
    throw new ApiError('Sign in to the account that saved this change.', 401);
  }
  const digest = await hash(JSON.stringify([request.method, recordId, predecessor, raw]));

  async function committed() {
    const prior = await receipt(operationId!, accountId, space, kind, recordId!);
    if (!prior) return null;
    if (prior.request_hash !== digest) throw new ApiError('This change was already saved with different values.', 409);
    const saved = await db().prepare('SELECT data,created_at FROM records WHERE id=? AND space=? AND kind=? AND updated_at=?')
      .bind(recordId, space, kind, prior.saved_at).first<{ data: string; created_at: string }>();
    return {
      ok: true, id: recordId, updatedAt: prior.saved_at,
      ...(saved && { record: { ...JSON.parse(saved.data), id: recordId, createdAt: saved.created_at, updatedAt: prior.saved_at } }),
    };
  }

  async function expectedVersion() {
    if (!predecessor) return undefined;
    const prior = await receipt(predecessor, accountId, space, kind, recordId!);
    if (!prior) throw new ApiError('A previous change for this record still needs to sync.', 409);
    return prior.saved_at;
  }

  function statement(savedAt: string) {
    // The receipt is written in the same D1 batch as the record. A zero-row
    // optimistic update violates NOT NULL and rolls the entire batch back.
    return db().prepare(
      'INSERT INTO record_writes(id,account_id,space,kind,record_id,request_hash,saved_at) VALUES(?,?,?,?,?,?,CASE WHEN changes()=1 THEN ? END)',
    ).bind(operationId, accountId, space, kind, recordId, digest, savedAt);
  }

  return { recordId, committed, expectedVersion, statement };
}
