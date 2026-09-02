-- 031 introduced normalized capability persistence for existing installations.
-- Fresh installs apply migrations before their business/settings rows are
-- created, so capability rows also need to be created by lifecycle triggers.

CREATE TRIGGER IF NOT EXISTS trg_business_capabilities_business_insert
AFTER INSERT ON business
WHEN NEW.deleted_at = ''
BEGIN
  INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.id, 'core.customers', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.tasks', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.calendar', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.notifications', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.finance', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.reports', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.web', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.sync', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.backups', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'core.devices', 1, 'system', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.barcode', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.purchasing', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.suppliers', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.labels', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_business_capabilities_settings_insert
AFTER INSERT ON settings
WHEN NEW.deleted_at = ''
BEGIN
  INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.business_id, 'service.whatsapp', NEW.whatsapp_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.android', NEW.android_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.ai', NEW.ai_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.rooms', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.reservations', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.stays', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.folio', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.tables', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.reservations', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.orders', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.menu', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'channel.qr_menu', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.catalog', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.inventory', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.sales', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at);
END;

-- Recreate transition update triggers as UPSERTs. This handles databases where
-- a capability row was intentionally absent while still protecting explicit
-- profile/user overrides from legacy settings writes.
DROP TRIGGER IF EXISTS trg_business_capabilities_settings_update;
CREATE TRIGGER trg_business_capabilities_settings_update
AFTER UPDATE OF ai_enabled, whatsapp_enabled, android_enabled, rooms_enabled, tables_enabled, qr_menu_enabled ON settings
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.business_id, 'service.whatsapp', NEW.whatsapp_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.android', NEW.android_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.ai', NEW.ai_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.rooms', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.reservations', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.stays', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'accommodation.folio', NEW.rooms_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.tables', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.reservations', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.orders', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'food_service.menu', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'channel.qr_menu', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.catalog', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.inventory', NEW.qr_menu_enabled, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'commerce.sales', NEW.tables_enabled, 'legacy', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    updated_at = excluded.updated_at
  WHERE business_capabilities.source = 'legacy';
END;

DROP TRIGGER IF EXISTS trg_business_capabilities_business_type_update;
CREATE TRIGGER trg_business_capabilities_business_type_update
AFTER UPDATE OF business_type ON business
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.id, 'retail.barcode', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.purchasing', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.suppliers', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.labels', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    updated_at = excluded.updated_at
  WHERE business_capabilities.source = 'legacy';
END;

-- Defensive backfill for any database that reached 031 with no business rows
-- yet and populated setup data before this migration was applied.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, 1, 'system', b.created_at, b.updated_at
FROM business b
CROSS JOIN (
  SELECT 'core.customers' AS capability_id UNION ALL
  SELECT 'core.tasks' UNION ALL SELECT 'core.calendar' UNION ALL
  SELECT 'core.notifications' UNION ALL SELECT 'core.finance' UNION ALL
  SELECT 'core.reports' UNION ALL SELECT 'core.web' UNION ALL
  SELECT 'core.sync' UNION ALL SELECT 'core.backups' UNION ALL SELECT 'core.devices'
)
WHERE b.deleted_at = '';
