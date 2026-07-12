ALTER TABLE settings ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 0;

UPDATE settings
SET setup_completed = 1
WHERE LENGTH(TRIM(sync_secret)) >= 12
  AND sync_secret <> 'change-this-secret';
