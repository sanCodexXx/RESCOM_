-- Stores center photos in the database so they survive restarts/redeploys
-- on hosts with an ephemeral disk (e.g. Render's free tier).
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS CENTER_IMAGES (
  center_id  INTEGER PRIMARY KEY REFERENCES EVACUATION_CENTERS(center_id) ON DELETE CASCADE,
  image_data BYTEA NOT NULL,
  image_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg'
);
