
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { sendPinEmail } = require('../utils/mailer');
const { emit, notify } = require('../utils/notify');

const router = express.Router();

function sign(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      role: user.role,
      username: user.username
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function publicUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

function normalizePhPhone(raw) {
  const digits = String(raw || '').replace(/[\s\-().]/g, '');
  const match = digits.match(/^(?:\+63|63|0)(9\d{9})$/);
  return match ? `+63${match[1]}` : null;
}

// Registration
router.post('/register', async (req, res) => {
  let client = null;

  try {
    const {
      first_name,
      last_name,
      username,
      email,
      password,
      unit,
      phone,
      role
    } = req.body;

    if (!first_name || !last_name || !username || !email || !password) {
      return res.status(400).json({
        error: 'All fields are required'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }

    let cleanPhone = null;

    if (phone && String(phone).trim()) {
      cleanPhone = normalizePhPhone(phone);

      if (!cleanPhone) {
        return res.status(400).json({
          error: 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567'
        });
      }
    }

    client = await db.pool.connect();

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727001)');

    const {
      rows: [{ count }]
    } = await client.query(
      'SELECT COUNT(*)::int AS count FROM USERS'
    );

    const isFirstUser = count === 0;

    if (
      !isFirstUser &&
      process.env.ALLOW_PUBLIC_REGISTRATION !== 'true'
    ) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: 'Sign-up is closed. Ask an MDRRMO administrator to create your account.'
      });
    }

    const requested =
      role === 'ADMIN_STAFF'
        ? 'ADMIN_STAFF'
        : 'FIELD_PERSONNEL';

    const safeRole = isFirstUser
      ? 'ADMIN_STAFF'
      : requested;

    const status = isFirstUser
      ? 'Active'
      : 'Pending';

    const exists = await client.query(
      'SELECT 1 FROM USERS WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (exists.rows.length) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Username or email already exists'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const {
      rows: [user]
    } = await client.query(
      `INSERT INTO USERS
       (first_name, last_name, username, email,
        password_hash, role, unit, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING user_id, first_name, last_name,
       username, email, role, unit, phone,
       created_at, status`,
      [
        first_name,
        last_name,
        username,
        email,
        hash,
        safeRole,
        unit || (
          safeRole === 'ADMIN_STAFF'
            ? 'Command Headquarters'
            : 'Responder Team'
        ),
        cleanPhone,
        status
      ]
    );

    await client.query('COMMIT');

    if (isFirstUser) {
      return res.status(201).json({
        user,
        token: sign(user)
      });
    }

    const label =
      safeRole === 'ADMIN_STAFF'
        ? 'Admin Staff'
        : 'Field Personnel';

    emit('user_updated', user);

    notify(
      'New account awaiting approval',
      `${first_name} ${last_name} requested ${label} access.`,
      {
        type: 'warning',
        role: 'ADMIN_STAFF'
      }
    );

    return res.status(201).json({
      pending: true,
      message:
        'Your account was submitted. An administrator must approve it before you can log in.',
      user: publicUser(user)
    });

  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error(err);

    return res.status(500).json({
      error: 'Registration failed'
    });

  } finally {
    if (client) client.release();
  }
});

// Email-only password recovery
function genPin() {
  return String(
    crypto.randomInt(0, 1000000)
  ).padStart(6, '0');
}

async function findResetUser(identifier) {
  if (
    !identifier ||
    typeof identifier !== 'string'
  ) {
    return null;
  }

  const { rows } = await db.query(
    `SELECT * FROM USERS
     WHERE username = $1 OR email = $1
     LIMIT 1`,
    [identifier.trim()]
  );

  return rows[0] || null;
}

// Request password-reset PIN by email
router.post('/forgot-password/request', async (req, res) => {
  const {
    identifier,
    phone,
    channel
  } = req.body || {};

  if (
    !identifier ||
    typeof identifier !== 'string'
  ) {
    return res.status(400).json({
      error: 'Enter your email or username'
    });
  }

  if (phone || (channel && channel !== 'email')) {
    return res.status(400).json({
      error: 'Password recovery is available through email only.'
    });
  }

  try {
    const user = await findResetUser(identifier);

    if (user && user.email) {
      const pin = genPin();

      const pinHash = await bcrypt.hash(pin, 10);

      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000
      );

      const result = await sendPinEmail(
        user.email,
        pin
      );

      if (result && result.delivered === true) {
        await db.query(
          `INSERT INTO PASSWORD_RESETS
           (user_id, pin_hash, channel, expires_at)
           VALUES ($1,$2,$3,$4)`,
          [
            user.user_id,
            pinHash,
            'email',
            expiresAt
          ]
        );
      } else {
        console.error(
          'Password reset email was not delivered'
        );
      }

      notify(
        'Password reset requested',
        `${user.username} requested a password reset PIN via email.`,
        {
          type: 'warning',
          role: 'ADMIN_STAFF'
        }
      );
    }

    return res.json({
      ok: true,
      message:
        'If an account matches, a PIN will be sent by email.'
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Could not process the request'
    });
  }
});

// Verify email PIN
router.post('/forgot-password/verify', async (req, res) => {
  const {
    identifier,
    phone,
    pin
  } = req.body || {};

  if (phone) {
    return res.status(400).json({
      error: 'Use email or username to reset your password.'
    });
  }

  if (
    !identifier ||
    !/^\d{6}$/.test(String(pin || ''))
  ) {
    return res.status(400).json({
      error: 'A valid 6-digit PIN is required'
    });
  }

  try {
    const user = await findResetUser(identifier);

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired PIN'
      });
    }

    const {
      rows: [reset]
    } = await db.query(
      `SELECT * FROM PASSWORD_RESETS
       WHERE user_id = $1
       AND channel = 'email'
       AND used = FALSE
       AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.user_id]
    );

    if (!reset || reset.attempts >= 5) {
      return res.status(400).json({
        error: 'Invalid or expired PIN'
      });
    }

    const ok = await bcrypt.compare(
      String(pin),
      reset.pin_hash
    );

    await db.query(
      `UPDATE PASSWORD_RESETS
       SET attempts = attempts + 1
       WHERE reset_id = $1`,
      [reset.reset_id]
    );

    if (!ok) {
      return res.status(400).json({
        error: 'Invalid or expired PIN'
      });
    }

    await db.query(
      `UPDATE PASSWORD_RESETS
       SET verified = TRUE
       WHERE reset_id = $1`,
      [reset.reset_id]
    );

    return res.json({ ok: true });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Could not verify PIN'
    });
  }
});

// Reset password after email verification
router.post('/forgot-password/reset', async (req, res) => {
  const {
    identifier,
    phone,
    pin,
    new_password
  } = req.body || {};

  if (phone) {
    return res.status(400).json({
      error: 'Use email or username to reset your password.'
    });
  }

  if (
    !identifier ||
    !/^\d{6}$/.test(String(pin || '')) ||
    !new_password
  ) {
    return res.status(400).json({
      error: 'All fields are required'
    });
  }

  if (String(new_password).length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters'
    });
  }

  try {
    const user = await findResetUser(identifier);

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired PIN'
      });
    }

    const {
      rows: [reset]
    } = await db.query(
      `SELECT * FROM PASSWORD_RESETS
       WHERE user_id = $1
       AND channel = 'email'
       AND verified = TRUE
       AND used = FALSE
       AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.user_id]
    );

    if (!reset) {
      return res.status(400).json({
        error: 'Verify your PIN again. This reset session expired.'
      });
    }

    const ok = await bcrypt.compare(
      String(pin),
      reset.pin_hash
    );

    if (!ok) {
      return res.status(400).json({
        error: 'Invalid or expired PIN'
      });
    }

    const hash = await bcrypt.hash(
      new_password,
      10
    );

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const claimed = await client.query(
        `UPDATE PASSWORD_RESETS
         SET used = TRUE
         WHERE reset_id = $1
         AND used = FALSE
         AND verified = TRUE
         AND expires_at > NOW()
         RETURNING reset_id`,
        [reset.reset_id]
      );

      if (!claimed.rowCount) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error: 'This reset PIN has already been used or expired.'
        });
      }

      await client.query(
        `UPDATE USERS
         SET password_hash = $1
         WHERE user_id = $2`,
        [hash, user.user_id]
      );

      await client.query('COMMIT');

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;

    } finally {
      client.release();
    }

    return res.json({
      ok: true,
      message:
        'Password updated. You can now log in.'
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Could not reset password'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password required'
      });
    }

    const { rows } = await db.query(
      `SELECT * FROM USERS
       WHERE username = $1 OR email = $1`,
      [username]
    );

    const user = rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: 'Invalid username or password'
      });
    }

    if (user.status === 'Pending') {
      return res.status(403).json({
        error:
          'Your account is waiting for approval from an MDRRMO administrator.'
      });
    }

    if (user.status === 'Inactive') {
      return res.status(403).json({
        error:
          'Your account has been deactivated. Please contact an administrator.'
      });
    }

    return res.json({
      user: publicUser(user),
      token: sign(user)
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Login failed'
    });
  }
});

// Current authenticated user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM USERS
       WHERE user_id = $1`,
      [req.user.user_id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    return res.json({
      user: publicUser(rows[0])
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Could not load user'
    });
  }
});

module.exports = router;
