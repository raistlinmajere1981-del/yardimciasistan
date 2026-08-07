-- Yardımcı Asistan — oda bazlı konaklama adisyonu
-- Rezervasyon planlama kaydıdır; parasal yaşam döngüsü oda/konaklama adisyonunda tutulur.

CREATE TABLE IF NOT EXISTS room_folios (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 50),
  check_in_date TEXT NOT NULL,
  planned_check_out_date TEXT NOT NULL DEFAULT '',
  nightly_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (nightly_price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  lodging_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (lodging_total_minor >= 0),
  lodging_manual_override INTEGER NOT NULL DEFAULT 0 CHECK (lodging_manual_override IN (0, 1)),
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (stay_id) REFERENCES customer_room_stays(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_room_folios_room_status
  ON room_folios(room_id, status, opened_at DESC) WHERE deleted_at = '';
CREATE INDEX IF NOT EXISTS idx_room_folios_customer
  ON room_folios(customer_id, opened_at DESC) WHERE deleted_at = '';
CREATE INDEX IF NOT EXISTS idx_room_folios_reservation
  ON room_folios(reservation_id) WHERE reservation_id != '' AND deleted_at = '';

CREATE TABLE IF NOT EXISTS room_folio_items (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('menu', 'manual_charge', 'discount')),
  menu_item_id TEXT NULL,
  label TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  line_total_minor INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (folio_id) REFERENCES room_folios(id),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE INDEX IF NOT EXISTS idx_room_folio_items_folio
  ON room_folio_items(folio_id, created_at) WHERE deleted_at = '';

CREATE TABLE IF NOT EXISTS room_folio_payments (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  paid_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'legacy')),
  source_payment_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (folio_id) REFERENCES room_folios(id)
);

CREATE INDEX IF NOT EXISTS idx_room_folio_payments_folio
  ON room_folio_payments(folio_id, paid_at DESC) WHERE deleted_at = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_folio_payments_legacy_source
  ON room_folio_payments(source_payment_id) WHERE source_payment_id != '';

CREATE VIEW IF NOT EXISTS room_folio_totals AS
SELECT
  base.folio_id,
  base.lodging_total_minor,
  base.extras_total_minor,
  MAX(base.raw_charge_total_minor, 0) AS charge_total_minor,
  base.paid_total_minor,
  MAX(MAX(base.raw_charge_total_minor, 0) - base.paid_total_minor, 0) AS remaining_minor,
  MAX(base.paid_total_minor - MAX(base.raw_charge_total_minor, 0), 0) AS credit_minor
FROM (
  SELECT
    folios.id AS folio_id,
    folios.lodging_total_minor,
    COALESCE(items.extras_total_minor, 0) AS extras_total_minor,
    folios.lodging_total_minor + COALESCE(items.extras_total_minor, 0) AS raw_charge_total_minor,
    COALESCE(payments.paid_total_minor, 0) AS paid_total_minor
  FROM room_folios AS folios
  LEFT JOIN (
    SELECT folio_id, SUM(line_total_minor) AS extras_total_minor
    FROM room_folio_items
    WHERE deleted_at = ''
    GROUP BY folio_id
  ) AS items ON items.folio_id = folios.id
  LEFT JOIN (
    SELECT folio_id, SUM(amount_minor) AS paid_total_minor
    FROM room_folio_payments
    WHERE deleted_at = ''
    GROUP BY folio_id
  ) AS payments ON payments.folio_id = folios.id
  WHERE folios.deleted_at = ''
) AS base;

-- Oda tahsilatı yalnız gerçekten para alındığında kasaya gelir olarak düşer.
CREATE TRIGGER IF NOT EXISTS trg_room_folio_payment_finance_insert
AFTER INSERT ON room_folio_payments
WHEN NEW.deleted_at = '' AND NEW.source = 'direct'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_room_folio_' || NEW.id,
    'income', NEW.amount_minor, NEW.currency, NEW.payment_method, 'pension', 'Oda tahsilatı',
    NEW.paid_at, 'room_folio_payment', NEW.id, NEW.note,
    NEW.created_at, NEW.updated_at, '', 'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = '';
END;

CREATE TRIGGER IF NOT EXISTS trg_room_folio_payment_finance_update
AFTER UPDATE ON room_folio_payments
WHEN NEW.source = 'direct'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_room_folio_' || NEW.id,
    'income', NEW.amount_minor, NEW.currency, NEW.payment_method, 'pension', 'Oda tahsilatı',
    NEW.paid_at, 'room_folio_payment', NEW.id, NEW.note,
    NEW.created_at, NEW.updated_at, NEW.deleted_at, 'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
END;

-- Fazla tahsilatı servis katmanının yanında DB seviyesinde de engelle.
CREATE TRIGGER IF NOT EXISTS trg_room_folio_payment_remaining_guard
BEFORE INSERT ON room_folio_payments
WHEN NEW.deleted_at = '' AND NEW.source = 'direct'
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT charge_total_minor FROM room_folio_totals WHERE folio_id = NEW.folio_id), 0) <= 0
      THEN RAISE(ABORT, 'room_folio_total_required')
    WHEN NEW.amount_minor > COALESCE((SELECT remaining_minor FROM room_folio_totals WHERE folio_id = NEW.folio_id), 0)
      THEN RAISE(ABORT, 'room_folio_payment_exceeds_remaining')
  END;
END;

-- Oda adisyonundaki temel durum değişiklikleri Android operasyon özetini yeniden yayınlasın.
CREATE TRIGGER IF NOT EXISTS trg_sync_room_folios_insert
AFTER INSERT ON room_folios
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

CREATE TRIGGER IF NOT EXISTS trg_sync_room_folios_update
AFTER UPDATE ON room_folios
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
