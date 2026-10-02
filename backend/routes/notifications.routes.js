const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/notifications — this user's notifications, newest first
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.notification_id, n.title, n.message, n.type, n.created_at, un.is_read
     FROM USER_NOTIFICATIONS un
     JOIN NOTIFICATIONS n ON n.notification_id = un.notification_id
     WHERE un.user_id = $1 AND un.is_deleted = FALSE
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [req.user.user_id]
  );
  res.json(rows);
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  await db.query(
    `UPDATE USER_NOTIFICATIONS SET is_read = TRUE WHERE user_id = $1 AND notification_id = $2`,
    [req.user.user_id, req.params.id]
  );
  res.json({ ok: true });
});

// PATCH /api/notifications/:id/unread
router.patch('/:id/unread', async (req, res) => {
  await db.query(
    `UPDATE USER_NOTIFICATIONS SET is_read = FALSE WHERE user_id = $1 AND notification_id = $2`,
    [req.user.user_id, req.params.id]
  );
  res.json({ ok: true });
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', async (req, res) => {
  await db.query(
    `UPDATE USER_NOTIFICATIONS SET is_read = TRUE WHERE user_id = $1 AND is_deleted = FALSE`,
    [req.user.user_id]
  );
  res.json({ ok: true });
});

// DELETE /api/notifications/:id — soft delete, scoped to this user only
router.delete('/:id', async (req, res) => {
  await db.query(
    `UPDATE USER_NOTIFICATIONS SET is_deleted = TRUE WHERE user_id = $1 AND notification_id = $2`,
    [req.user.user_id, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
