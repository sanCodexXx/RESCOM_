const jwt = require('jsonwebtoken');
const db = require('../db');
async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('unauthorized');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows: [user] } = await db.query('SELECT role, status FROM USERS WHERE user_id = $1', [payload.user_id]);
    if (!user || user.status !== 'Active') throw new Error('unauthorized');
    socket.data.user = { ...payload, role: user.role };
    next();
  } catch { next(new Error('unauthorized')); }
}
module.exports = { socketAuth };
