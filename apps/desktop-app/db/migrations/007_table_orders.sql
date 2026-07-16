CREATE TABLE IF NOT EXISTS table_orders (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'preparing', 'served', 'payment', 'paid', 'cancelled')),
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total REAL NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

CREATE TABLE IF NOT EXISTS table_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'preparing', 'served', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES table_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_orders_one_active_per_table
  ON table_orders(table_id)
  WHERE status IN ('open', 'preparing', 'served', 'payment');

CREATE INDEX IF NOT EXISTS idx_table_orders_status_opened_at
  ON table_orders(status, opened_at);

CREATE INDEX IF NOT EXISTS idx_table_order_items_order_id
  ON table_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_table_order_items_menu_item_id
  ON table_order_items(menu_item_id);
