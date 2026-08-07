-- Menü ürünü oda adisyonuna eklendiğinde adı/fiyatı snapshot olarak saklanır.
-- Menü kaydı sonradan silinebildiği için menu_item_id tarihsel bir referanstır;
-- manuel ücret/indirimlerde ise boş olabilir. Bu nedenle menu_items FK bağı kaldırılır.

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
