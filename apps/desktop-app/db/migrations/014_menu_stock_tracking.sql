ALTER TABLE menu_items ADD COLUMN stock_quantity REAL NULL
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE menu_items ADD COLUMN stock_min_quantity REAL NULL
  CHECK (stock_min_quantity IS NULL OR stock_min_quantity >= 0);

ALTER TABLE menu_items ADD COLUMN hide_when_out_of_stock INTEGER NOT NULL DEFAULT 0
  CHECK (hide_when_out_of_stock IN (0, 1));

ALTER TABLE menu_items ADD COLUMN stock_note TEXT NULL;

CREATE TABLE IF NOT EXISTS menu_stock_movements (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'add', 'remove', 'set', 'adjust',
    'order_add', 'order_update', 'order_remove', 'order_cancel'
  )),
  quantity_change REAL NOT NULL,
  quantity_before REAL NOT NULL CHECK (quantity_before >= 0),
  quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('desktop', 'android', 'table_order')),
  source_id TEXT NULL,
  actor_device_id TEXT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE INDEX IF NOT EXISTS idx_menu_stock_movements_item_created
  ON menu_stock_movements(menu_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_menu_stock_movements_source
  ON menu_stock_movements(source_type, source_id, created_at DESC);

-- Existing staff profiles are group-derived. Service/order and cashier devices
-- gain stock visibility, while manual stock updates remain admin-only by default.
UPDATE android_devices
SET permissions_json = CASE
  WHEN role = 'staff'
    AND permissions_json NOT LIKE '%"menu.stock_view"%'
    AND (
      permission_groups_json LIKE '%"service_orders":true%'
      OR permission_groups_json LIKE '%"cashier":true%'
    )
  THEN substr(permissions_json, 1, length(permissions_json) - 1)
    || CASE WHEN length(permissions_json) > 2 THEN ',"menu.stock_view"]' ELSE '"menu.stock_view"]' END
  ELSE permissions_json
END;
