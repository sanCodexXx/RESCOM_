const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit } = require('../utils/notify');
const { normalizePhPhone } = require('../utils/barangays');

const router = express.Router();
router.use(verifyToken);

// Wraps async handlers so a database error goes to the error handler, not a crash.
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const COLS = 'user_id, first_name, last_name, username, email, role, unit, phone, created_at, status, last_active_at';
const ROLES = ['ADMIN_STAFF', 'FIELD_PERSONNEL'];

// How many OTHER active administrators exist besides this user.
async function otherActiveAdmins(userId) {
  const { rows: [r] } = await db.query(
    "SELECT COUNT(*)::int AS n FROM USERS WHERE role = 'ADMIN_STAFF' AND status = 'Active' AND user_id <> $1",
    [userId]
  );
  return r.n;
}

// Pending accounts are listed first so approvals are easy to see.
router.get('/', h(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM USERS
     ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, created_at DESC`
  );
  res.json(rows);
}));

// Admin creates an account directly. These are Active straight away.
router.post('/', requireRole('ADMIN_STAFF'), h(async (req, res) => {
  const { first_name, last_name, username, email, password, role, unit, phone } = req.body;
  if (!first_name || !last_name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  let cleanPhone = null;
  if (phone && String(phone).trim()) {
    cleanPhone = normalizePhPhone(phone);
    if (!cleanPhone) return res.status(400).json({ error: 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await db.query(
      `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Active') RETURNING ${COLS}`,
      [first_name, last_name, username, email, hash, role || 'FIELD_PERSONNEL', unit || null, cleanPhone]
    );
    emit('user_updated', user);
    res.status(201).json(user);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username or email is already in use' });
    throw e;
  }
}));

router.put('/:id', requireRole('ADMIN_STAFF'), h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { first_name, last_name, email, role, unit, password, phone } = req.body;
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password && String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // Never demote the last active administrator.
  if (role === 'FIELD_PERSONNEL') {
    const { rows: [t] } = await db.query('SELECT role, status FROM USERS WHERE user_id = $1', [id]);
    if (t?.role === 'ADMIN_STAFF' && t.status === 'Active' && (await otherActiveAdmins(id)) === 0) {
      return res.status(400).json({ error: 'At least one active administrator is required' });
    }
  }

  let cleanPhone = null;
  if (phone && String(phone).trim()) {
    cleanPhone = normalizePhPhone(phone);
    if (!cleanPhone) return res.status(400).json({ error: 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567' });
  }
  const hash = password ? await bcrypt.hash(password, 10) : null;

  try {
    const { rows } = await db.query(
      `UPDATE USERS SET
         first_name    = COALESCE($1, first_name),
         last_name     = COALESCE($2, last_name),
         email         = COALESCE($3, email),
         role          = COALESCE($4, role),
         unit          = COALESCE($5, unit),
         phone         = COALESCE($6, phone),
         password_hash = COALESCE($7, password_hash)
       WHERE user_id = $8
       RETURNING ${COLS}`,
      [first_name, last_name, email, role, unit, cleanPhone, hash, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    emit('user_updated', rows[0]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already in use' });
    throw e;
  }
}));

// PATCH /api/users/:id/status  { status: 'Active' | 'Inactive' }
// Approve a Pending account = set Active. Deactivate = set Inactive.
router.patch('/:id/status', requireRole('ADMIN_STAFF'), h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Active or Inactive' });
  }
  if (id === req.user.user_id && status === 'Inactive') {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }

  const { rows: [t] } = await db.query('SELECT role, status FROM USERS WHERE user_id = $1', [id]);
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (status === 'Inactive' && t.role === 'ADMIN_STAFF' && t.status === 'Active' && (await otherActiveAdmins(id)) === 0) {
    return res.status(400).json({ error: 'At least one active administrator is required' });
  }

  const { rows } = await db.query(`UPDATE USERS SET status = $1 WHERE user_id = $2 RETURNING ${COLS}`, [status, id]);
  emit('user_updated', rows[0]);
  res.json(rows[0]);
}));

// Deleting a Pending account is how an admin rejects a sign-up.
router.delete('/:id', requireRole('ADMIN_STAFF'), h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.user_id) return res.status(400).json({ error: "You can't delete your own account" });

  const { rows: [t] } = await db.query('SELECT role, status FROM USERS WHERE user_id = $1', [id]);
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (t.role === 'ADMIN_STAFF' && t.status === 'Active' && (await otherActiveAdmins(id)) === 0) {
    return res.status(400).json({ error: 'At least one active administrator is required' });
  }

  await db.query('DELETE FROM USERS WHERE user_id = $1', [id]);
  emit('user_updated', { user_id: id, deleted: true });
  res.json({ message: 'User deleted' });
}));

// Self-service profile update (any signed-in user, own record only)
router.put('/me/profile', h(async (req, res) => {
  const { first_name, last_name, email, password, phone } = req.body;
  let cleanPhone = null;
  if (phone && String(phone).trim()) {
    cleanPhone = normalizePhPhone(phone);
    if (!cleanPhone) return res.status(400).json({ error: 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567' });
  }
  if (password && String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const { rows } = await db.query(
    `UPDATE USERS SET
       first_name    = COALESCE($1, first_name),
       last_name     = COALESCE($2, last_name),
       email         = COALESCE($3, email),
       phone         = COALESCE($4, phone),
       password_hash = COALESCE($5, password_hash)
     WHERE user_id = $6
     RETURNING ${COLS}`,
    [first_name, last_name, email, cleanPhone, hash, req.user.user_id]
  );
  res.json(rows[0]);
}));

module.exports = router;