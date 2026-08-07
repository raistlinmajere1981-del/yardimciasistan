-- Yardımcı Asistan — sade kasa / ön muhasebe temeli
-- Parasal değerler kuruş cinsinden INTEGER olarak tutulur.

ALTER TABLE reservations ADD COLUMN agreed_total_minor INTEGER NOT NULL DEFAULT 0
  CHECK (agreed_total_minor >= 0);
ALTER TABLE reservations ADD COLUMN currency TEXT NOT NULL DEFAULT 'TRY';

ALTER TABLE rooms ADD COLUMN nightly_price_minor INTEGER NOT NULL DEFAULT 0
  CHECK (nightly_price_minor >= 0);
ALTER TABLE rooms ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'TRY';

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_occurred_at
  ON finance_entries(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_entries_direction_category
  ON finance_entries(direction, category, occurred_at DESC)
  WHERE deleted_at = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_source
  ON finance_entries(source_type, source_id)
  WHERE source_id != '';

CREATE TABLE IF NOT EXISTS pension_payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  stay_id TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  paid_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX IF NOT EXISTS idx_pension_payments_reservation
  ON pension_payments(reservation_id, paid_at DESC)
  WHERE deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_pension_payments_paid_at
  ON pension_payments(paid_at DESC)
  WHERE deleted_at = '';

-- Her pansiyon tahsilatı kasada otomatik gelir kaydı oluşturur.
CREATE TRIGGER IF NOT EXISTS trg_pension_payment_finance_insert
AFTER INSERT ON pension_payments
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    deleted_at,
    sync_status
  ) VALUES (
    'finance_pension_' || NEW.id,
    'income',
    NEW.amount_minor,
    NEW.currency,
    NEW.payment_method,
    'pension',
    'Pansiyon ödemesi',
    NEW.paid_at,
    'pension_payment',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    '',
    'local_only'
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

CREATE TRIGGER IF NOT EXISTS trg_pension_payment_finance_update
AFTER UPDATE ON pension_payments
BEGIN
  INSERT INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    deleted_at,
    sync_status
  ) VALUES (
    'finance_pension_' || NEW.id,
    'income',
    NEW.amount_minor,
    NEW.currency,
    NEW.payment_method,
    'pension',
    'Pansiyon ödemesi',
    NEW.paid_at,
    'pension_payment',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    NEW.deleted_at,
    'local_only'
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

-- Pansiyon ödeme durumu kullanıcı seçimi değil, toplam ve tahsilattan türetilir.
CREATE TRIGGER IF NOT EXISTS trg_reservation_insert_payment_status
AFTER INSERT ON reservations
WHEN NEW.agreed_total_minor > 0
BEGIN
  UPDATE reservations
  SET payment_status = 'unpaid'
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pension_payment_status_insert
AFTER INSERT ON pension_payments
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) < agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.reservation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pension_payment_status_update
AFTER UPDATE ON pension_payments
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) < agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.reservation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reservation_total_payment_status
AFTER UPDATE OF agreed_total_minor ON reservations
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN NEW.agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0) < NEW.agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.id;
END;

-- Restoran adisyonu ödendiğinde kullanıcı tekrar gelir girmek zorunda kalmaz.
CREATE TRIGGER IF NOT EXISTS trg_paid_table_order_finance_insert
AFTER INSERT ON table_orders
WHEN NEW.status = 'paid' AND NEW.total > 0
BEGIN
  INSERT OR IGNORE INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    sync_status
  ) VALUES (
    'finance_restaurant_' || NEW.id,
    'income',
    CAST(ROUND(NEW.total * 100) AS INTEGER),
    COALESCE((SELECT currency FROM table_order_items WHERE order_id = NEW.id LIMIT 1), 'TRY'),
    'unspecified',
    'restaurant',
    'Restoran adisyonu',
    COALESCE(NULLIF(NEW.closed_at, ''), NEW.updated_at),
    'restaurant_order',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    'local_only'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_paid_table_order_finance_update
AFTER UPDATE OF status, total, closed_at, note, updated_at ON table_orders
WHEN NEW.status = 'paid' AND NEW.total > 0
BEGIN
  INSERT INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    sync_status
  ) VALUES (
    'finance_restaurant_' || NEW.id,
    'income',
    CAST(ROUND(NEW.total * 100) AS INTEGER),
    COALESCE((SELECT currency FROM table_order_items WHERE order_id = NEW.id LIMIT 1), 'TRY'),
    'unspecified',
    'restaurant',
    'Restoran adisyonu',
    COALESCE(NULLIF(NEW.closed_at, ''), NEW.updated_at),
    'restaurant_order',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = '';
END;

-- Ödenmiş bir adisyon daha sonra sıfıra çekilirse kasa kaydı görünür toplamdan çıkar.
CREATE TRIGGER IF NOT EXISTS trg_zero_paid_table_order_finance_update
AFTER UPDATE OF status, total, updated_at ON table_orders
WHEN NEW.status = 'paid' AND NEW.total <= 0
BEGIN
  UPDATE finance_entries
  SET deleted_at = NEW.updated_at, updated_at = NEW.updated_at
  WHERE source_type = 'restaurant_order' AND source_id = NEW.id;
END;

-- Mevcut ödenmiş adisyonları ilk migration sırasında kasaya taşı.
INSERT OR IGNORE INTO finance_entries (
  id,
  direction,
  amount_minor,
  currency,
  payment_method,
  category,
  description,
  occurred_at,
  source_type,
  source_id,
  note,
  created_at,
  updated_at,
  sync_status
)
SELECT
  'finance_restaurant_' || table_orders.id,
  'income',
  CAST(ROUND(table_orders.total * 100) AS INTEGER),
  COALESCE((SELECT currency FROM table_order_items WHERE table_order_items.order_id = table_orders.id LIMIT 1), 'TRY'),
  'unspecified',
  'restaurant',
  'Restoran adisyonu',
  COALESCE(NULLIF(table_orders.closed_at, ''), table_orders.updated_at),
  'restaurant_order',
  table_orders.id,
  table_orders.note,
  table_orders.created_at,
  table_orders.updated_at,
  'local_only'
FROM table_orders
WHERE table_orders.status = 'paid' AND table_orders.total > 0;

CREATE VIEW IF NOT EXISTS pension_payment_totals AS
SELECT
  reservations.id AS reservation_id,
  reservations.agreed_total_minor AS agreed_total_minor,
  reservations.currency AS currency,
  COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0) AS paid_total_minor,
  CASE
    WHEN reservations.agreed_total_minor - COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0) > 0
      THEN reservations.agreed_total_minor - COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0)
    ELSE 0
  END AS remaining_minor
FROM reservations
LEFT JOIN pension_payments ON pension_payments.reservation_id = reservations.id
WHERE reservations.deleted_at = ''
GROUP BY reservations.id;
