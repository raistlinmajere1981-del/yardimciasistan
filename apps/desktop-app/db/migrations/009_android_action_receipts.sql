CREATE TABLE IF NOT EXISTS android_action_receipts (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  device_id TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_android_action_receipts_applied_at
  ON android_action_receipts(applied_at);
