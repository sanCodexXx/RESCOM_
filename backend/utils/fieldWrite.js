const { createHash } = require('node:crypto');
const db = require('../db');

function writeError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function claimWrite(client, req) {
  const id = req.get('Idempotency-Key');
  if (!id) return null;
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
    throw writeError(400, 'Invalid RESCOM change ID.');
  }
  const userId = req.user.user_id;
  if (Number(req.get('X-RESCOM-Owner')) !== userId) {
    throw writeError(403, 'Sign in as the account that saved this change.');
  }
  const capturedAt = req.get('X-RESCOM-Captured-At') || null;
  if (capturedAt && !Number.isFinite(Date.parse(capturedAt))) {
    throw writeError(400, 'Invalid capture time for this change.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([
    req.method, req.baseUrl, req.path, req.body ?? {}, capturedAt, req.file?.mimetype
  ])).update(req.file?.buffer ?? '').digest('hex');
  const claimed = await client.query(
    `INSERT INTO RESCOM_FIELD_WRITES (user_id, change_id, fingerprint)
     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING change_id`,
    [userId, id, fingerprint]
  );
  if (claimed.rowCount) return { userId, id, capturedAt, replayed: false };

  const { rows: [existing] } = await client.query(
    'SELECT fingerprint, response FROM RESCOM_FIELD_WRITES WHERE user_id = $1 AND change_id = $2',
    [userId, id]
  );
  if (existing?.fingerprint !== fingerprint) {
    throw writeError(409, 'This change ID already belongs to a different save.');
  }
  return { userId, id, capturedAt, replayed: true, response: existing.response };
}

async function finishWrite(client, receipt, response) {
  if (receipt) {
    await client.query(
      'UPDATE RESCOM_FIELD_WRITES SET response = $1 WHERE user_id = $2 AND change_id = $3',
      [JSON.stringify(response), receipt.userId, receipt.id]
    );
  }
}

function writeFailure(error, res) {
  if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
  if (['22P02', '22001', '23503', '23505', '23514'].includes(error.code)) {
    return res.status(409).json({ error: 'Check the details and current records before saving this change.' });
  }
  console.error('RESCOM field save failed', error.code || error.name);
  return res.status(500).json({ error: 'The server could not confirm this save.' });
}

function fieldWrite(status, write, afterCommit) {
  return async (req, res) => {
    let client;
    let result;
    let replayed;
    try {
      client = await db.pool.connect();
      await client.query('BEGIN');
      const receipt = await claimWrite(client, req);
      replayed = receipt?.replayed;
      result = replayed ? receipt.response : await write(req, client, receipt);
      if (!replayed) await finishWrite(client, receipt, result);
      await client.query('COMMIT');
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return writeFailure(error, res);
    } finally {
      client?.release();
    }
    if (!replayed) afterCommit?.(req, result);
    return res.status(status).json(result);
  };
}

module.exports = { claimWrite, finishWrite, fieldWrite, writeError, writeFailure };
