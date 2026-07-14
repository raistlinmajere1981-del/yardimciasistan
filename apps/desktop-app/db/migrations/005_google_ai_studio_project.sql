ALTER TABLE settings ADD COLUMN ai_project_name TEXT NOT NULL DEFAULT '';

UPDATE settings
SET ai_base_url = 'https://generativelanguage.googleapis.com/v1beta'
WHERE ai_service = 'gemini';
