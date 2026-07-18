ALTER TABLE android_devices
  ADD COLUMN permission_groups_json TEXT NOT NULL
  DEFAULT '{"service_orders":true,"cashier":false,"rooms_tasks":true,"customer_reservation":false}';

UPDATE android_devices
SET
  permission_groups_json = '{"service_orders":true,"cashier":false,"rooms_tasks":true,"customer_reservation":false}',
  permissions_json = CASE
    WHEN role = 'staff' THEN '["table.view","table.update_status","table_order.view","table_order.open","table_order.add_item","table_order.update_item","table_order.remove_item","table_order.set_preparing","table_order.set_served","table_order.set_payment_waiting","menu.view","room.view","room.update_status","daily_task.view","daily_task.complete","daily_task.reopen"]'
    ELSE permissions_json
  END;

DROP TRIGGER IF EXISTS trg_sync_android_devices_permissions_update;

CREATE TRIGGER trg_sync_android_devices_permissions_update
AFTER UPDATE OF role, is_active, permissions_json, permission_groups_json, revoked_at ON android_devices
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;
