CREATE TABLE IF NOT EXISTS ai_service_profiles (
  service TEXT PRIMARY KEY,
  project_name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  model_options_json TEXT NOT NULL DEFAULT '[]',
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_service_profiles (
  service,
  project_name,
  base_url,
  model,
  model_options_json,
  timeout_seconds,
  api_key_encrypted,
  created_at,
  updated_at
)
SELECT
  CASE
    WHEN ai_service IN ('openai', 'openrouter', 'groq', 'gemini', 'custom') THEN ai_service
    ELSE 'openai'
  END,
  ai_project_name,
  ai_base_url,
  ai_model,
  '[]',
  ai_timeout_seconds,
  ai_api_key_encrypted,
  created_at,
  updated_at
FROM settings
WHERE deleted_at = ''
LIMIT 1;
