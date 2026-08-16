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
