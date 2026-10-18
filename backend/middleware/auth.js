const jwt = require('jsonwebtoken');
const db = require('../db');

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
    const { rows: [u] } = await db.query('SELECT status FROM USERS WHERE user_id = $1', [payload.user_id]);
    if (!u) return res.status(401).json({ error: 'This account no longer exists' });
    if (u.status === 'Pending') return res.status(401).json({ error: 'Your account is waiting for approval' });
    if (u.status === 'Inactive') return res.status(401).json({ error: 'Your account has been deactivated' });

    // Record activity at most once every 5 minutes, for the "Last Active" column.
    db.query(
      "UPDATE USERS SET last_active_at = NOW() WHERE user_id = $1 AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '5 minutes')",
      [payload.user_id]
    ).catch(() => {});
  } catch (e) {
    // 42703 = the status column doesn't exist yet (migration 005 not run). Don't lock everyone out.
    if (e.code !== '42703') return next(e);
  }

  req.user = payload; // { user_id, role, username }
  next();
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