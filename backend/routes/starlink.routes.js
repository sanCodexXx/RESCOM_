const express = require('express');
const { timingSafeEqual } = require('node:crypto');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const alertNames = new Set(['thermal_throttle', 'thermal_shutdown', 'slow_ethernet', 'obstructed']);

function relayToken() {
  const token = process.env.STARLINK_RELAY_TOKEN;
  return /^[a-f0-9]{64}$/i.test(token || '') ? token : null;
}

function terminalId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase().replace(/^ut/, '');
  return /^[a-f0-9]{8}(?:-[a-f0-9]{8}){2}$/.test(id) ? id : null;
}

const writeLatest = `INSERT INTO STARLINK_STATUS (slot, reachable, alerts) VALUES (1, $1, $2)
  ON CONFLICT (slot) DO UPDATE SET reachable = EXCLUDED.reachable, alerts = EXCLUDED.alerts, reported_at = clock_timestamp()`;

router.post('/status', async (req, res) => {
  const expected = relayToken();
  const presented = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!expected || !presented || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(presented, 'hex'))) {
    return res.status(401).json({ error: 'Invalid Starlink relay token' });
  }

  const { reachable, alerts, terminal_id } = req.body || {};
  const id = terminalId(terminal_id);
  if (typeof reachable !== 'boolean' || !Array.isArray(alerts) || alerts.length > alertNames.size ||
      alerts.some(alert => !alertNames.has(alert)) || (!reachable && alerts.length > 0) ||
      (terminal_id != null && !id)) {
    return res.status(400).json({ error: 'Invalid dish diagnostics' });
  }

  const values = [reachable, [...new Set(alerts)]];
  if (id) {
    await db.query(
      `WITH latest AS (${writeLatest} RETURNING reachable, alerts, reported_at)
       INSERT INTO STARLINK_DISH_REPORTS (terminal_id, reachable, alerts, reported_at)
       SELECT $3, reachable, alerts, reported_at FROM latest
       ON CONFLICT (terminal_id) DO UPDATE SET reachable = EXCLUDED.reachable,
         alerts = EXCLUDED.alerts, reported_at = EXCLUDED.reported_at`,
      [...values, id]
    );
  } else await db.query(writeLatest, values);
  res.sendStatus(204);
});

async function getConnection(userId) {
  const { rows: [row] } = await db.query(
    `SELECT d.name, d.terminal_id, r.reachable, r.alerts, r.reported_at,
       r.reported_at < NOW() - INTERVAL '2 minutes' AS stale
     FROM STARLINK_USER_DISHES d
     LEFT JOIN STARLINK_DISH_REPORTS r ON r.terminal_id = d.terminal_id
     WHERE d.user_id = $1`, [userId]
  );
  const relayEnabled = Boolean(relayToken());
  return {
    relayEnabled,
    dish: row ? { name: row.name, terminal_id: row.terminal_id } : null,
    report: relayEnabled && row?.reported_at ? { reachable: row.reachable, alerts: row.alerts, reported_at: row.reported_at, stale: row.stale } : null
  };
}

router.get('/connection', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await getConnection(req.user.user_id));
});

router.put('/connection', verifyToken, async (req, res) => {
  const id = terminalId(req.body?.terminal_id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!id || !name || name.length > 80) {
    return res.status(400).json({ error: 'Enter a dish name and the Terminal ID shown in the Starlink app.' });
  }
  await db.query(
    `INSERT INTO STARLINK_USER_DISHES (user_id, terminal_id, name) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET terminal_id = EXCLUDED.terminal_id, name = EXCLUDED.name`,
    [req.user.user_id, id, name]
  );
  res.set('Cache-Control', 'no-store').json(await getConnection(req.user.user_id));
});

router.delete('/connection', verifyToken, async (req, res) => {
  await db.query('DELETE FROM STARLINK_USER_DISHES WHERE user_id = $1', [req.user.user_id]);
  res.sendStatus(204);
});

router.get('/status', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!relayToken()) return res.json({ configured: false });
  const { rows: [report] } = await db.query(
    `SELECT reachable, alerts, reported_at, reported_at < NOW() - INTERVAL '2 minutes' AS stale
     FROM STARLINK_STATUS WHERE slot = 1`
  );
  res.json({ configured: true, report: report || null });
});

module.exports = router;
