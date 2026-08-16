-- Restoran adisyonunun oda hesabına yalnız bir kez aktarılmasını garanti eder.
-- Restoran ürünlerinin stoku adisyon açılırken zaten düşer; bu transfer yeni bir
-- stok hareketi oluşturmaz, yalnız mevcut adisyon toplamını oda folyosuna taşır.

CREATE TABLE IF NOT EXISTS room_folio_table_order_transfers (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  folio_item_id TEXT NOT NULL UNIQUE,
  table_order_id TEXT NOT NULL UNIQUE,
  table_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  created_at TEXT NOT NULL,
  FOREIGN KEY (folio_id) REFERENCES room_folios(id),
  FOREIGN KEY (folio_item_id) REFERENCES room_folio_items(id),
  FOREIGN KEY (table_order_id) REFERENCES table_orders(id),
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

CREATE INDEX IF NOT EXISTS idx_room_folio_order_transfers_folio
  ON room_folio_table_order_transfers(folio_id, created_at DESC);

-- Odaya yazılan restoran hesabı restoran adisyonuyla birlikte tek bir finansal
-- izdir. Normal folyo kalemi silme akışı bu bağı koparamaz; düzeltme gerekiyorsa
-- açık bir "transferi geri al" işlemiyle iki taraf birlikte değiştirilmelidir.
CREATE TRIGGER IF NOT EXISTS trg_room_folio_transfer_item_delete_guard
BEFORE UPDATE OF deleted_at ON room_folio_items
WHEN OLD.deleted_at = ''
  AND NEW.deleted_at != ''
  AND EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE folio_item_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'room_folio_table_order_transfer_locked');
END;
