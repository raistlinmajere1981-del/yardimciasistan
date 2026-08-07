-- Menü ürünü oda adisyonuna eklendiğinde adı/fiyatı snapshot olarak saklanır.
-- Menü kaydı sonradan silinebildiği için menu_item_id tarihsel bir referanstır;
-- manuel ücret/indirimlerde ise boş olabilir. Bu nedenle menu_items FK bağı kaldırılır.

-- Guard trigger toplam görünümüne bağlıdır. Tabloyu yeniden kurarken görünümü
-- geçici olarak kaldırabilmek için önce trigger'ı kaldır, en sonda yeniden oluştur.
DROP TRIGGER IF EXISTS trg_room_folio_payment_remaining_guard;
DROP VIEW IF EXISTS room_folio_totals;

ALTER TABLE room_folio_items RENAME TO room_folio_items_with_menu_fk;

CREATE TABLE room_folio_items (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('menu', 'manual_charge', 'discount')),
  menu_item_id TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  line_total_minor INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (folio_id) REFERENCES room_folios(id)
);

INSERT INTO room_folio_items (
  id, folio_id, kind, menu_item_id, label, unit_price_minor, quantity,
  line_total_minor, note, created_at, updated_at, deleted_at, sync_status
)
SELECT
  id, folio_id, kind, COALESCE(menu_item_id, ''), label, unit_price_minor, quantity,
  line_total_minor, note, created_at, updated_at, deleted_at, sync_status
FROM room_folio_items_with_menu_fk;

DROP TABLE room_folio_items_with_menu_fk;

CREATE INDEX IF NOT EXISTS idx_room_folio_items_folio
  ON room_folio_items(folio_id, created_at) WHERE deleted_at = '';

CREATE VIEW room_folio_totals AS
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
