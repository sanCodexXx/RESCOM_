const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { emit } = require('../utils/notify');

const router = express.Router();
router.use(verifyToken);

const COLS = 'user_id, first_name, last_name, username, email, role, unit, phone, status, last_active_at, created_at';
const ROLES = ['ADMIN_STAFF', 'FIELD_PERSONNEL'];

// Only a user id goes out over the websocket (the Users page just reloads its list),
// so names, emails and phone numbers are never broadcast to every connected client.
const ping = (extra = {}) => emit('user_updated', extra);

async function findUser(id) {
  const { rows: [u] } = await db.query('SELECT user_id, role, status FROM USERS WHERE user_id = $1', [id]);
  return u || null;
}

// Friendly message for the one database error users can actually trigger (duplicate username/email).
function dbError(err, res) {
  if (err.code === '23505') return res.status(400).json({ error: 'Username or email already exists' });
  throw err;
}

// Pending requests first, so a new sign-up is the first thing an admin sees.
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM USERS ORDER BY (status = 'Pending') DESC, created_at DESC`
  );
  res.json(rows);
});

router.post('/', requireRole('ADMIN_STAFF'), async (req, res) => {
  const { first_name, last_name, username, email, password, role, unit, phone } = req.body;
  if (!first_name || !last_name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const hash = await bcrypt.hash(password, 10);
  try {
    // Accounts an admin creates are Active straight away.
    const { rows: [user] } = await db.query(
      `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Active')
       RETURNING ${COLS}`,
      [first_name, last_name, username, email, hash, role || 'FIELD_PERSONNEL', unit || null, phone || null]
    );
    ping({ user_id: user.user_id });
    res.status(201).json(user);
  } catch (err) { dbError(err, res); }
});

// Approve / reject / activate / deactivate. Admin Staff only.
//   Pending  -> Active    = approve the sign-up request
//   Active   -> Inactive  = deactivate (can no longer log in or use the API)
//   Inactive -> Active    = reactivate
// To reject a request, the Users page deletes the Pending account (DELETE below).
router.patch('/:id/status', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Active or Inactive' });
  }
  if (id === req.user.user_id) return res.status(400).json({ error: "You can't change your own account status" });

  const target = await findUser(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { rows: [user] } = await db.query(
    `UPDATE USERS SET status = $1 WHERE user_id = $2 RETURNING ${COLS}`, [status, id]
  );
  ping({ user_id: id });
  res.json(user);
});

router.put('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { first_name, last_name, email, role, unit, password, phone } = req.body;
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const target = await findUser(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (role && role !== target.role) {
    if (id === req.user.user_id) return res.status(400).json({ error: "You can't change your own role" });
  }

  const hash = password ? await bcrypt.hash(password, 10) : null;
  try {
    const { rows: [user] } = await db.query(
      `UPDATE USERS SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         email      = COALESCE($3, email),
         role       = COALESCE($4, role),
         unit       = COALESCE($5, unit),
         phone      = COALESCE($6, phone),
         password_hash = COALESCE($7, password_hash)
       WHERE user_id = $8
       RETURNING ${COLS}`,
      [first_name, last_name, email, role, unit, phone, hash, id]
    );
    ping({ user_id: id });
    res.json(user);
  } catch (err) { dbError(err, res); }
});

router.delete('/:id', requireRole('ADMIN_STAFF'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.user_id) return res.status(400).json({ error: "You can't delete your own account" });

  const target = await findUser(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  // Records this user created (evacuees, incidents...) are kept; their author just becomes empty.
  await db.query('DELETE FROM USERS WHERE user_id = $1', [id]);
  ping({ user_id: id, deleted: true });
  res.json({ message: 'User deleted' });
});

// Self-service profile update (any authenticated user, own record only)
router.put('/me/profile', async (req, res) => {
  const { first_name, last_name, email, password, phone } = req.body;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  try {
    const { rows } = await db.query(
      `UPDATE USERS SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         email      = COALESCE($3, email),
         phone      = COALESCE($4, phone),
         password_hash = COALESCE($5, password_hash)
       WHERE user_id = $6
       RETURNING ${COLS}`,
      [first_name, last_name, email, phone, hash, req.user.user_id]
    );
    res.json(rows[0]);
  } catch (err) { dbError(err, res); }
});

module.exports = router;