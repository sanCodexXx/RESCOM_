const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT user_id, first_name, last_name, username, email, role, unit, phone, created_at
     FROM USERS ORDER BY created_at DESC`
  );
  res.json(rows);
});

router.post('/', requireRole('ADMIN_STAFF'), async (req, res) => {
  const { first_name, last_name, username, email, password, role, unit, phone } = req.body;
  if (!first_name || !last_name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows: [user] } = await db.query(
    `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING user_id, first_name, last_name, username, email, role, unit, phone, created_at`,
    [first_name, last_name, username, email, hash, role || 'FIELD_PERSONNEL', unit || null, phone || null]
  );
  emit('user_updated', user);
  res.status(201).json(user);
});

router.put('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { first_name, last_name, email, role, unit, password, phone } = req.body;
  const hash = password ? await bcrypt.hash(password, 10) : null;

  const { rows } = await db.query(
    `UPDATE USERS SET
       first_name = COALESCE($1, first_name),
       last_name  = COALESCE($2, last_name),
       email      = COALESCE($3, email),
       role       = COALESCE($4, role),
       unit       = COALESCE($5, unit),
       phone      = COALESCE($6, phone),
       password_hash = COALESCE($7, password_hash)
     WHERE user_id = $8
     RETURNING user_id, first_name, last_name, username, email, role, unit, phone, created_at`,
    [first_name, last_name, email, role, unit, phone, hash, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  emit('user_updated', rows[0]);
  res.json(rows[0]);
});

router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.query('DELETE FROM USERS WHERE user_id = $1', [id]);
  emit('user_updated', { user_id: id, deleted: true });
  res.json({ message: 'User deleted' });
});

// Self-service profile update (any authenticated user, own record only)
router.put('/me/profile', async (req, res) => {
  const { first_name, last_name, email, password, phone } = req.body;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const { rows } = await db.query(
    `UPDATE USERS SET
       first_name = COALESCE($1, first_name),
       last_name  = COALESCE($2, last_name),
       email      = COALESCE($3, email),
       phone      = COALESCE($4, phone),
       password_hash = COALESCE($5, password_hash)
     WHERE user_id = $6
     RETURNING user_id, first_name, last_name, username, email, role, unit, phone, created_at`,
    [first_name, last_name, email, phone, hash, req.user.user_id]
  );
  res.json(rows[0]);
});

module.exports = router;
