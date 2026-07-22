CREATE TABLE menu_stock_movements_v15 (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'add', 'remove', 'set', 'adjust', 'image_import_add',
    'order_add', 'order_update', 'order_remove', 'order_cancel'
  )),
  quantity_change REAL NOT NULL,
  quantity_before REAL NOT NULL CHECK (quantity_before >= 0),
  quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'desktop', 'android', 'table_order', 'stock_image_import'
  )),
  source_id TEXT NULL,
  actor_source TEXT NOT NULL CHECK (actor_source IN ('desktop', 'android')),
  actor_device_id TEXT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

INSERT INTO menu_stock_movements_v15 (
  id, menu_item_id, type, quantity_change, quantity_before, quantity_after,
  source_type, source_id, actor_source, actor_device_id, note, created_at
)
SELECT
  id, menu_item_id, type, quantity_change, quantity_before, quantity_after,
  source_type, source_id,
  CASE WHEN source_type = 'android' OR actor_device_id IS NOT NULL THEN 'android' ELSE 'desktop' END,
  actor_device_id, note, created_at
FROM menu_stock_movements;

DROP TABLE menu_stock_movements;
ALTER TABLE menu_stock_movements_v15 RENAME TO menu_stock_movements;

CREATE INDEX idx_menu_stock_movements_item_created
  ON menu_stock_movements(menu_item_id, created_at DESC);

CREATE INDEX idx_menu_stock_movements_source
  ON menu_stock_movements(source_type, source_id, created_at DESC);

CREATE TABLE stock_image_imports (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('desktop', 'android')),
  device_id TEXT NULL,
  image_hash TEXT NOT NULL,
  original_filename TEXT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'analyzing', 'review', 'applied', 'cancelled', 'failed'
  )),
  supplier_name TEXT NULL,
  invoice_number TEXT NULL,
  invoice_date TEXT NULL,
  raw_analysis_json TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT NULL
);

CREATE INDEX idx_stock_image_imports_hash_status
  ON stock_image_imports(image_hash, status, created_at DESC);

CREATE INDEX idx_stock_image_imports_created
  ON stock_image_imports(created_at DESC);

CREATE TABLE stock_image_import_lines (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  matched_menu_item_id TEXT NULL,
  suggested_quantity INTEGER NULL CHECK (suggested_quantity IS NULL OR suggested_quantity > 0),
  approved_quantity INTEGER NULL CHECK (approved_quantity IS NULL OR approved_quantity > 0),
  source_quantity_text TEXT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'ignored', 'needs_review')),
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES stock_image_imports(import_id) ON DELETE CASCADE,
  FOREIGN KEY (matched_menu_item_id) REFERENCES menu_items(id)
);

CREATE INDEX idx_stock_image_import_lines_import
  ON stock_image_import_lines(import_id, created_at ASC, id ASC);
