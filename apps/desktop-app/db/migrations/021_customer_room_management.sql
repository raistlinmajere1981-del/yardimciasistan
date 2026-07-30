ALTER TABLE customers ADD COLUMN identity_type TEXT NOT NULL DEFAULT ''
  CHECK (identity_type IN ('', 'tc_identity_card', 'passport', 'other'));
ALTER TABLE customers ADD COLUMN identity_number TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN nationality TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN birth_date TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN gender TEXT NOT NULL DEFAULT ''
  CHECK (gender IN ('', 'female', 'male', 'unspecified'));
ALTER TABLE customers ADD COLUMN document_serial_number TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN document_expiry_date TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN birth_place TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN mother_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN father_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN issuing_authority TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN address TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_identity_number
  ON customers(identity_number)
  WHERE identity_number != '' AND deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_customers_phone_active
  ON customers(phone)
  WHERE phone != '' AND deleted_at = '';

CREATE TABLE IF NOT EXISTS customer_room_stays (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'checked_in', 'checked_out', 'cancelled')),
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL DEFAULT '',
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 50),
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  checked_in_at TEXT NOT NULL DEFAULT '',
  checked_out_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_room_stays_customer
  ON customer_room_stays(customer_id, check_in_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_room_stays_room
  ON customer_room_stays(room_id, status, check_in_date, check_out_date);

CREATE INDEX IF NOT EXISTS idx_customer_room_stays_reservation
  ON customer_room_stays(reservation_id)
  WHERE reservation_id != '';

INSERT OR IGNORE INTO customer_room_stays (
  id,
  customer_id,
  room_id,
  reservation_id,
  status,
  check_in_date,
  check_out_date,
  guest_count,
  notes,
  source,
  checked_in_at,
  checked_out_at,
  created_at,
  updated_at,
  sync_status
)
SELECT
  'stay_legacy_' || reservations.id || '_' || rooms_json.value,
  reservations.customer_id,
  rooms_json.value,
  reservations.id,
  CASE
    WHEN reservations.status = 'completed' THEN 'checked_out'
    ELSE 'planned'
  END,
  reservations.start_date,
  reservations.end_date,
  MIN(50, MAX(1, reservations.guest_count)),
  reservations.notes,
  'reservation_migration',
  '',
  CASE WHEN reservations.status = 'completed' THEN reservations.updated_at ELSE '' END,
  reservations.created_at,
  reservations.updated_at,
  'local_only'
FROM reservations
JOIN json_each(reservations.room_ids_json) AS rooms_json
JOIN customers
  ON customers.id = reservations.customer_id
  AND customers.deleted_at = ''
JOIN rooms
  ON rooms.id = rooms_json.value
  AND rooms.deleted_at = ''
WHERE reservations.deleted_at = ''
  AND reservations.customer_id != ''
  AND reservations.status IN ('pending', 'approved', 'completed')
  AND reservations.start_date != '';

CREATE TRIGGER IF NOT EXISTS trg_sync_customer_room_stays_insert
AFTER INSERT ON customer_room_stays
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_customer_room_stays_update
AFTER UPDATE ON customer_room_stays
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;
