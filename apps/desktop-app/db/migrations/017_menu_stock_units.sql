ALTER TABLE menu_items ADD COLUMN stock_unit TEXT NOT NULL DEFAULT 'piece'
  CHECK (stock_unit IN ('piece', 'gram'));

ALTER TABLE menu_items ADD COLUMN stock_consumption_quantity REAL NOT NULL DEFAULT 1
  CHECK (stock_consumption_quantity > 0);
