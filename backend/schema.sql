-- ============================================================
-- RESCOM: Real-time Evacuation Status Coordination and Monitoring
-- PostgreSQL schema — matches the relational schema in the
-- project documentation (Activity 4 supporting docs).
-- ============================================================

DROP TABLE IF EXISTS PASSWORD_RESETS CASCADE;
DROP TABLE IF EXISTS USER_NOTIFICATIONS CASCADE;
DROP TABLE IF EXISTS NOTIFICATIONS CASCADE;
DROP TABLE IF EXISTS DROMIC_REPORTS CASCADE;
DROP TABLE IF EXISTS PRIORITY_CASES CASCADE;
DROP TABLE IF EXISTS EVACUATION_RECORDS CASCADE;
DROP TABLE IF EXISTS DISASTER_INCIDENTS CASCADE;
DROP TABLE IF EXISTS EVACUATION_CENTERS CASCADE;
DROP TABLE IF EXISTS EVACUEES CASCADE;
DROP TABLE IF EXISTS FAMILIES CASCADE;
DROP TABLE IF EXISTS USERS CASCADE;

-- ------------------------------------------------------------
-- USERS: both Admin Staff and Field Personnel accounts
-- ------------------------------------------------------------
CREATE TABLE USERS (
  user_id        SERIAL PRIMARY KEY,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  username       VARCHAR(100) UNIQUE NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  phone          VARCHAR(30),
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(30)  NOT NULL DEFAULT 'FIELD_PERSONNEL'
                 CHECK (role IN ('ADMIN_STAFF', 'FIELD_PERSONNEL')),
  unit           VARCHAR(150),
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- FAMILIES: household groupings, one per evacuated family
-- ------------------------------------------------------------
CREATE TABLE FAMILIES (
  family_id         SERIAL PRIMARY KEY,
  family_name       VARCHAR(150) NOT NULL,
  household_address VARCHAR(255),
  barangay          VARCHAR(100) NOT NULL,
  contact_number    VARCHAR(30),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- EVACUEES: individuals, linked to a family
-- ------------------------------------------------------------
CREATE TABLE EVACUEES (
  evacuee_id   SERIAL PRIMARY KEY,
  family_id    INTEGER REFERENCES FAMILIES(family_id) ON DELETE SET NULL,
  first_name   VARCHAR(100) NOT NULL,
  middle_name  VARCHAR(100),
  last_name    VARCHAR(100) NOT NULL,
  age          INTEGER,
  gender       VARCHAR(20),
  birthdate    DATE
);

-- ------------------------------------------------------------
-- EVACUATION_CENTERS
-- ------------------------------------------------------------
CREATE TABLE EVACUATION_CENTERS (
  center_id    SERIAL PRIMARY KEY,
  center_name  VARCHAR(200) NOT NULL,
  barangay     VARCHAR(100) NOT NULL,
  address      VARCHAR(255),
  capacity     INTEGER NOT NULL DEFAULT 0,
  occupancy    INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(30) NOT NULL DEFAULT 'Open'
               CHECK (status IN ('Open', 'Full', 'Standby', 'Closed')),
  image_url    VARCHAR(255)
);

-- ------------------------------------------------------------
-- DISASTER_INCIDENTS
-- ------------------------------------------------------------
CREATE TABLE DISASTER_INCIDENTS (
  incident_id      SERIAL PRIMARY KEY,
  disaster_name    VARCHAR(200) NOT NULL,
  disaster_type    VARCHAR(100) NOT NULL,
  date_started     TIMESTAMP NOT NULL DEFAULT NOW(),
  date_ended       TIMESTAMP,
  reporting_status VARCHAR(30) NOT NULL DEFAULT 'Pending'
                   CHECK (reporting_status IN ('Pending', 'En Route', 'Active', 'Resolved')),
  field_remarks    TEXT,
  brgy             VARCHAR(100),
  severity         VARCHAR(20) DEFAULT 'Medium'
                   CHECK (severity IN ('High', 'Medium', 'Low')),
  reported_by      INTEGER REFERENCES USERS(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- EVACUATION_RECORDS: links an evacuee to a center + incident
-- ------------------------------------------------------------
CREATE TABLE EVACUATION_RECORDS (
  record_id      SERIAL PRIMARY KEY,
  evacuee_id     INTEGER NOT NULL REFERENCES EVACUEES(evacuee_id) ON DELETE CASCADE,
  center_id      INTEGER NOT NULL REFERENCES EVACUATION_CENTERS(center_id) ON DELETE CASCADE,
  incident_id    INTEGER REFERENCES DISASTER_INCIDENTS(incident_id) ON DELETE SET NULL,
  registered_by  INTEGER REFERENCES USERS(user_id) ON DELETE SET NULL,
  date_evacuated TIMESTAMP NOT NULL DEFAULT NOW(),
  status         VARCHAR(30) NOT NULL DEFAULT 'Present'
                 CHECK (status IN ('Present', 'Checked out')),
  remarks        TEXT
);

-- ------------------------------------------------------------
-- PRIORITY_CASES: vulnerable-person flags on an evacuee
-- ------------------------------------------------------------
CREATE TABLE PRIORITY_CASES (
  priority_id     SERIAL PRIMARY KEY,
  evacuee_id      INTEGER NOT NULL REFERENCES EVACUEES(evacuee_id) ON DELETE CASCADE,
  case_type       VARCHAR(50) NOT NULL, -- Elderly, PWD, Pregnant, Infant, Lactating Mother, With Illness, Solo Parent
  description     TEXT,
  priority_status VARCHAR(30) NOT NULL DEFAULT 'Flagged'
                  CHECK (priority_status IN ('Flagged', 'Attended', 'Resolved')),
  flagged_by      INTEGER REFERENCES USERS(user_id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- DROMIC_REPORTS
-- ------------------------------------------------------------
CREATE TABLE DROMIC_REPORTS (
  report_id        SERIAL PRIMARY KEY,
  incident_id      INTEGER REFERENCES DISASTER_INCIDENTS(incident_id) ON DELETE SET NULL,
  generated_by     INTEGER REFERENCES USERS(user_id) ON DELETE SET NULL,
  report_date      TIMESTAMP NOT NULL DEFAULT NOW(),
  reporting_status VARCHAR(30) NOT NULL DEFAULT 'Active'
                   CHECK (reporting_status IN ('Draft', 'Active', 'Finalized')),
  field_remarks    TEXT
);

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
CREATE INDEX idx_evacuees_family        ON EVACUEES(family_id);
CREATE INDEX idx_records_evacuee        ON EVACUATION_RECORDS(evacuee_id);
CREATE INDEX idx_records_center         ON EVACUATION_RECORDS(center_id);
CREATE INDEX idx_priority_evacuee       ON PRIORITY_CASES(evacuee_id);
CREATE INDEX idx_incidents_status       ON DISASTER_INCIDENTS(reporting_status);

-- ------------------------------------------------------------
-- NOTIFICATIONS / USER_NOTIFICATIONS / PASSWORD_RESETS
-- ------------------------------------------------------------
CREATE TABLE NOTIFICATIONS (
  notification_id SERIAL PRIMARY KEY,
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(20) NOT NULL DEFAULT 'info'
                  CHECK (type IN ('info', 'success', 'warning', 'danger')),
  target_role     VARCHAR(30),               -- NULL = everyone
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE USER_NOTIFICATIONS (
  user_id         INTEGER NOT NULL REFERENCES USERS(user_id) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES NOTIFICATIONS(notification_id) ON DELETE CASCADE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE PASSWORD_RESETS (
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

CREATE INDEX idx_notifications_created ON NOTIFICATIONS(created_at DESC);
CREATE INDEX idx_resets_user ON PASSWORD_RESETS(user_id, created_at DESC);
