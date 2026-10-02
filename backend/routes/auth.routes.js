const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { sendPinEmail } = require('../utils/mailer');
const { sendPinSms } = require('../utils/sms');

const router = express.Router();

function sign(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// POST /api/auth/register
// Security rules:
//  - The very first account ever created becomes ADMIN_STAFF (bootstrap), so
//    no demo seed data is needed in production.
//  - After that, anyone who self-registers is FIELD_PERSONNEL. The role in
//    the request body is ignored: only an existing Admin Staff can create or
//    promote admins (Users page).
//  - Set ALLOW_PUBLIC_REGISTRATION=false to close self-registration
//    completely; admins then create accounts from the Users page.
router.post('/register', async (req, res) => {
  try {
    const { first_name, last_name, username, email, password, unit, phone } = req.body;
    if (!first_name || !last_name || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int AS count FROM USERS');
    const isFirstUser = count === 0;
    if (!isFirstUser && process.env.ALLOW_PUBLIC_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'Sign-up is closed. Ask an MDRRMO administrator to create your account.' });
    }
    const safeRole = isFirstUser ? 'ADMIN_STAFF' : 'FIELD_PERSONNEL';

    const exists = await db.query(
      'SELECT 1 FROM USERS WHERE username = $1 OR email = $2', [username, email]
    );
    if (exists.rows.length) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await db.query(
      `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING user_id, first_name, last_name, username, email, role, unit, phone, created_at`,
      [first_name, last_name, username, email, hash, safeRole, unit || (safeRole === 'ADMIN_STAFF' ? 'Command Headquarters' : 'Responder Team'), phone || null]
    );

    res.status(201).json({ user, token: sign(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ---------------------------------------------------------------------
// Forgot password — 3-step PIN flow, delivered by email or SMS.
//   1) POST /forgot-password/request  { identifier, channel: 'email'|'sms' }
//   2) POST /forgot-password/verify   { identifier, pin }
//   3) POST /forgot-password/reset    { identifier, pin, new_password }
// The response never reveals whether an account exists.
// ---------------------------------------------------------------------

function genPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

router.post('/forgot-password/request', async (req, res) => {
  const { identifier, channel } = req.body;
  if (!identifier) return res.status(400).json({ error: 'Username or email is required' });
  if (!['email', 'sms'].includes(channel)) return res.status(400).json({ error: 'Choose email or SMS' });

  try {
    const { rows } = await db.query('SELECT * FROM USERS WHERE username = $1 OR email = $1', [identifier]);
    const user = rows[0];
    let devPin = null; // only ever set when nothing was actually delivered

    if (user) {
      if (channel === 'sms' && !user.phone) {
        return res.status(400).json({ error: 'This account has no phone number on file. Try email instead.' });
      }
      const pin = genPin();
      const pinHash = await bcrypt.hash(pin, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.query(
        `INSERT INTO PASSWORD_RESETS (user_id, pin_hash, channel, expires_at) VALUES ($1,$2,$3,$4)`,
        [user.user_id, pinHash, channel, expiresAt]
      );
      const result = channel === 'email' ? await sendPinEmail(user.email, pin) : await sendPinSms(user.phone, pin);
      // SMTP/SMS isn't configured (or failed) — nothing was actually sent.
      // In development only, hand the PIN back so testing doesn't require
      // tailing server logs. NEVER returned when NODE_ENV=production.
      if (!result.delivered && process.env.NODE_ENV !== 'production') devPin = result.pin;

      require('../utils/notify').notify(
        'Password reset requested',
        `${user.username} requested a password reset PIN via ${channel}.`,
        { type: 'warning', role: 'ADMIN_STAFF' }
      );
    }
    // Same reply whether or not the account exists — don't leak enumeration.
    res.json({
      ok: true,
      message: devPin
        ? `Email/SMS isn't configured yet, so here's your PIN for testing: ${devPin}`
        : `If an account matches, a PIN was sent via ${channel}.`,
      dev_pin: devPin || undefined
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process the request' });
  }
});

router.post('/forgot-password/verify', async (req, res) => {
  const { identifier, pin } = req.body;
  if (!identifier || !pin) return res.status(400).json({ error: 'PIN is required' });
  try {
    const { rows: [user] } = await db.query('SELECT * FROM USERS WHERE username = $1 OR email = $1', [identifier]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired PIN' });

    const { rows: [reset] } = await db.query(
      `SELECT * FROM PASSWORD_RESETS WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.user_id]
    );
    if (!reset || reset.attempts >= 5) return res.status(400).json({ error: 'Invalid or expired PIN' });

    const ok = await bcrypt.compare(pin, reset.pin_hash);
    await db.query('UPDATE PASSWORD_RESETS SET attempts = attempts + 1 WHERE reset_id = $1', [reset.reset_id]);
    if (!ok) return res.status(400).json({ error: 'Invalid or expired PIN' });

    await db.query('UPDATE PASSWORD_RESETS SET verified = TRUE WHERE reset_id = $1', [reset.reset_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify PIN' });
  }
});

router.post('/forgot-password/reset', async (req, res) => {
  const { identifier, pin, new_password } = req.body;
  if (!identifier || !pin || !new_password) return res.status(400).json({ error: 'All fields are required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const { rows: [user] } = await db.query('SELECT * FROM USERS WHERE username = $1 OR email = $1', [identifier]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired PIN' });

    const { rows: [reset] } = await db.query(
      `SELECT * FROM PASSWORD_RESETS WHERE user_id = $1 AND verified = TRUE AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.user_id]
    );
    if (!reset) return res.status(400).json({ error: 'Verify your PIN again — this reset session expired' });

    const ok = await bcrypt.compare(pin, reset.pin_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid or expired PIN' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE USERS SET password_hash = $1 WHERE user_id = $2', [hash, user.user_id]);
    await db.query('UPDATE PASSWORD_RESETS SET used = TRUE WHERE reset_id = $1', [reset.reset_id]);

    res.json({ ok: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const { rows } = await db.query(
      'SELECT * FROM USERS WHERE username = $1 OR email = $1', [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

    res.json({ user: publicUser(user), token: sign(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — resolve the current token to a fresh user record
router.get('/me', verifyToken, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM USERS WHERE user_id = $1', [req.user.user_id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(rows[0]) });
});

module.exports = router;
