const jwt = require('jsonwebtoken');
const db = require('../db');

// Verifies the token AND checks the account in the database on every request, so
//  - a deleted user is locked out immediately,
//  - a Pending (awaiting approval) or Inactive (deactivated) account can't use the API,
//  - a role change by an admin takes effect right away instead of when the token expires.
async function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { rows: [u] } = await db.query(
      'SELECT user_id, role, username, status, last_active_at FROM USERS WHERE user_id = $1',
      [payload.user_id]
    );
    if (!u) return res.status(401).json({ error: 'This account no longer exists' });
    if (u.status === 'Pending') return res.status(403).json({ error: 'Your account is waiting for administrator approval.' });
    if (u.status === 'Inactive') return res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });

    req.user = { user_id: u.user_id, role: u.role, username: u.username };

    // "Last active" on the Users page. Written at most once a minute per user.
    if (!u.last_active_at || Date.now() - new Date(u.last_active_at).getTime() > 60 * 1000) {
      db.query('UPDATE USERS SET last_active_at = NOW() WHERE user_id = $1', [u.user_id]).catch(() => {});
    }
    next();
  } catch (err) {
    // 42703 = column does not exist: the status migration has not been run on this
    // database yet. Keep the site working (trust the token) instead of failing every request.
    if (err.code === '42703') {
      console.warn('USERS.status column missing - run backend/migrations/003_user_status.sql');
      req.user = payload;
      return next();
    }
    console.error('verifyToken failed:', err.message);
    return res.status(500).json({ error: 'Could not verify your session' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };