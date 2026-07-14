ALTER TABLE settings ADD COLUMN ai_service TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE settings ADD COLUMN ai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1';
ALTER TABLE settings ADD COLUMN ai_timeout_seconds INTEGER NOT NULL DEFAULT 30;
ALTER TABLE settings ADD COLUMN ai_api_key_encrypted TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN ai_last_published_at TEXT NOT NULL DEFAULT '';

UPDATE settings
SET ai_provider = 'openai_compatible'
WHERE TRIM(ai_provider) = ''
   OR ai_provider <> 'openai_compatible';
