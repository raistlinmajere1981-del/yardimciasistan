ALTER TABLE settings ADD COLUMN app_password_verifier TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN app_password_updated_at TEXT NOT NULL DEFAULT '';
