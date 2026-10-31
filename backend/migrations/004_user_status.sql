-- Additive upgrade; does not drop or recreate records.
BEGIN;
ALTER TABLE USERS ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';
ALTER TABLE USERS ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_valid' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE USERS ADD CONSTRAINT users_status_valid CHECK (status IN ('Active', 'Inactive', 'Pending'));
  END IF;
END $$;
COMMIT;
