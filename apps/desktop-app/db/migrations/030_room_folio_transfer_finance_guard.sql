-- Oda hesabına aktarılan restoran adisyonu tahsil edilmiş sayılmaz.
-- Adisyon 'paid' durumuna yalnız masayı kapatmak için geçer; gerçek kasa geliri
-- oda folyosu ödeme aldığında room_folio_payment kaydı üzerinden oluşur.

DROP TRIGGER IF EXISTS trg_paid_table_order_finance_insert;
DROP TRIGGER IF EXISTS trg_paid_table_order_finance_update;

CREATE TRIGGER trg_paid_table_order_finance_insert
AFTER INSERT ON table_orders
WHEN NEW.status = 'paid'
  AND NEW.total > 0
  AND NOT EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE table_order_id = NEW.id
  )
BEGIN
  INSERT OR IGNORE INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, sync_status
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

CREATE TRIGGER trg_paid_table_order_finance_update
AFTER UPDATE OF status, total, closed_at, note, updated_at ON table_orders
WHEN NEW.status = 'paid'
  AND NEW.total > 0
  AND NOT EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE table_order_id = NEW.id
  )
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, sync_status
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

-- Bu özellik önceki bir sürümde kullanıldıysa yanlışlıkla oluşmuş restoran kasa
-- kaydını görünür toplamdan çıkar. Kaydı fiziksel silmek yerine audit izi korunur.
UPDATE finance_entries
SET deleted_at = CASE WHEN deleted_at = '' THEN datetime('now') ELSE deleted_at END,
    updated_at = datetime('now')
WHERE source_type = 'restaurant_order'
  AND source_id IN (
    SELECT table_order_id FROM room_folio_table_order_transfers
  );
