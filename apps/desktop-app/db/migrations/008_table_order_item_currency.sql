ALTER TABLE table_order_items
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'TRY'
  CHECK (currency GLOB '[A-Z][A-Z][A-Z]');
