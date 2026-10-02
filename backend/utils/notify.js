// Broadcast + persistence layer for notifications.
// server.js calls setIo(io) once at boot so route modules can emit without
// importing the io instance directly everywhere.
const db = require('../db');

let io = null;

function setIo(instance) {
  io = instance;
}

// Raw realtime event (center_updated, evacuee_registered, ...) — no bell entry.
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

// Creates a persisted notification, fans it out to every target user's
// notification list, and pushes a realtime 'notification' event so open
// clients refresh their bell immediately.
// role: null = everyone, or 'ADMIN_STAFF' / 'FIELD_PERSONNEL' to target one role.
async function notify(title, message, { type = 'info', role = null } = {}) {
  try {
    const { rows: [n] } = await db.query(
      `INSERT INTO NOTIFICATIONS (title, message, type, target_role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [title, message, type, role]
    );

    const { rows: users } = role
      ? await db.query('SELECT user_id FROM USERS WHERE role = $1', [role])
      : await db.query('SELECT user_id FROM USERS');

    if (users.length) {
      const values = users.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO USER_NOTIFICATIONS (notification_id, user_id) VALUES ${values}`,
        [n.notification_id, ...users.map(u => u.user_id)]
      );
    }

    emit('notification', { ...n, is_read: false });
    return n;
  } catch (err) {
    console.error('notify() failed:', err.message);
  }
}

module.exports = { setIo, emit, notify };
