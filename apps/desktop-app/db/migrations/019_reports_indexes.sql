CREATE INDEX IF NOT EXISTS idx_table_orders_report_closed
  ON table_orders(status, closed_at);

CREATE INDEX IF NOT EXISTS idx_table_order_items_report_order_status
  ON table_order_items(order_id, status);

CREATE INDEX IF NOT EXISTS idx_requests_report_created_status
  ON requests(created_at, status)
  WHERE deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_reservations_report_created_status
  ON reservations(created_at, status)
  WHERE deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_daily_tasks_report_due_status
  ON daily_tasks(due_date, status)
  WHERE deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_menu_stock_movements_report_created_source
  ON menu_stock_movements(created_at, source_type);
