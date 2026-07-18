ALTER TABLE settings ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN sync_client_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sync_runtime (
  id TEXT PRIMARY KEY,
  request_cursor INTEGER NOT NULL DEFAULT 0,
  acknowledged_cursor INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL DEFAULT '',
  last_success_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sync_runtime (
  id, request_cursor, acknowledged_cursor, last_attempt_at, last_success_at,
  last_error, consecutive_failures, updated_at
) VALUES (
  'primary', 0, 0, '', '', '', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  job_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('menu_publish', 'android_snapshot')),
  source_revision INTEGER NOT NULL DEFAULT 1,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sync_outbox (
  job_key, job_type, source_revision, attempt_count, next_attempt_at,
  last_error, created_at, updated_at
) VALUES (
  'menu', 'menu_publish', 1, 0, '', '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO sync_outbox (
  job_key, job_type, source_revision, attempt_count, next_attempt_at,
  last_error, created_at, updated_at
) VALUES (
  'android_snapshot', 'android_snapshot', 1, 0, '', '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TRIGGER IF NOT EXISTS trg_sync_menu_categories_insert
AFTER INSERT ON menu_categories WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_menu_categories_update
AFTER UPDATE ON menu_categories WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_menu_items_insert
AFTER INSERT ON menu_items WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_menu_items_update
AFTER UPDATE ON menu_items WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_requests_insert
AFTER INSERT ON requests
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_requests_update
AFTER UPDATE ON requests
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_customers_insert AFTER INSERT ON customers BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_customers_update AFTER UPDATE ON customers BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_reservations_insert AFTER INSERT ON reservations BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_reservations_update AFTER UPDATE ON reservations BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_rooms_insert AFTER INSERT ON rooms BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_rooms_update AFTER UPDATE ON rooms BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_tables_insert AFTER INSERT ON tables BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_tables_update AFTER UPDATE ON tables BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_daily_tasks_insert AFTER INSERT ON daily_tasks BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_daily_tasks_update AFTER UPDATE ON daily_tasks BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_whatsapp_messages_insert AFTER INSERT ON whatsapp_messages BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_whatsapp_messages_update AFTER UPDATE ON whatsapp_messages BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_table_orders_insert AFTER INSERT ON table_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_table_orders_update AFTER UPDATE ON table_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_table_order_items_insert AFTER INSERT ON table_order_items BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_sync_table_order_items_update AFTER UPDATE ON table_order_items BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
