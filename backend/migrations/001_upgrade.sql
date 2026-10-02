-- Run ONCE on an existing database (keeps all current data):
--   psql -d mdrrmo_db -f migrations/001_upgrade.sql
-- Fresh installs can just load schema.sql instead.

ALTER TABLE USERS ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE EVACUATION_CENTERS ADD COLUMN IF NOT EXISTS image_url VARCHAR(255);

CREATE TABLE IF NOT EXISTS NOTIFICATIONS (
  notification_id SERIAL PRIMARY KEY,
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(20) NOT NULL DEFAULT 'info'
                  CHECK (type IN ('info', 'success', 'warning', 'danger')),
  target_role     VARCHAR(30),               -- NULL = everyone
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS USER_NOTIFICATIONS (
  user_id         INTEGER NOT NULL REFERENCES USERS(user_id) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES NOTIFICATIONS(notification_id) ON DELETE CASCADE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE IF NOT EXISTS PASSWORD_RESETS (
  reset_id   SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES USERS(user_id) ON DELETE CASCADE,
  pin_hash   VARCHAR(255) NOT NULL,
  channel    VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  verified   BOOLEAN NOT NULL DEFAULT FALSE,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON NOTIFICATIONS(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resets_user ON PASSWORD_RESETS(user_id, created_at DESC);
