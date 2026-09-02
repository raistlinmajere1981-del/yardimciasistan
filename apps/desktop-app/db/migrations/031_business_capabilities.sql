CREATE TABLE IF NOT EXISTS business_capabilities (
  business_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'legacy' CHECK (source IN ('system', 'profile', 'legacy', 'user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_business_capabilities_enabled
  ON business_capabilities (business_id, is_enabled, capability_id);

-- Core is intentionally independent from the historical room/table switches.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, 1, 'system', b.created_at, b.updated_at
FROM business b
CROSS JOIN (
  SELECT 'core.customers' AS capability_id UNION ALL
  SELECT 'core.tasks' UNION ALL
  SELECT 'core.calendar' UNION ALL
  SELECT 'core.notifications' UNION ALL
  SELECT 'core.finance' UNION ALL
  SELECT 'core.reports' UNION ALL
  SELECT 'core.web' UNION ALL
  SELECT 'core.sync' UNION ALL
  SELECT 'core.backups' UNION ALL
  SELECT 'core.devices'
)
WHERE b.deleted_at = '';

-- Service capabilities mirror the current settings only during the transition.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, 'service.whatsapp', COALESCE(s.whatsapp_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
WHERE b.deleted_at = '';

INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, 'service.android', COALESCE(s.android_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
WHERE b.deleted_at = '';

INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, 'service.ai', COALESCE(s.ai_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
WHERE b.deleted_at = '';

-- Accommodation domain: one legacy switch currently controls the domain bundle.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, COALESCE(s.rooms_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b
LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
CROSS JOIN (
  SELECT 'accommodation.rooms' AS capability_id UNION ALL
  SELECT 'accommodation.reservations' UNION ALL
  SELECT 'accommodation.stays' UNION ALL
  SELECT 'accommodation.folio'
)
WHERE b.deleted_at = '';

-- Food service tables/orders and sales follow the historical tables switch.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, COALESCE(s.tables_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b
LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
CROSS JOIN (
  SELECT 'food_service.tables' AS capability_id UNION ALL
  SELECT 'food_service.reservations' UNION ALL
  SELECT 'food_service.orders' UNION ALL
  SELECT 'commerce.sales'
)
WHERE b.deleted_at = '';

-- Menu/catalog/inventory currently share the QR-menu switch. They are split
-- into separate capabilities now so Market can later enable them independently.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, COALESCE(s.qr_menu_enabled, 0), 'legacy', b.created_at, b.updated_at
FROM business b
LEFT JOIN settings s ON s.business_id = b.id AND s.deleted_at = ''
CROSS JOIN (
  SELECT 'food_service.menu' AS capability_id UNION ALL
  SELECT 'channel.qr_menu' UNION ALL
  SELECT 'commerce.catalog' UNION ALL
  SELECT 'commerce.inventory'
)
WHERE b.deleted_at = '';

-- Retail is represented in persistence before its UI exists. Switching a
-- business to the Market profile later can activate this bundle without adding
-- new boolean columns to settings.
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, capability_id, CASE WHEN b.business_type = 'market' THEN 1 ELSE 0 END, 'legacy', b.created_at, b.updated_at
FROM business b
CROSS JOIN (
  SELECT 'retail.barcode' AS capability_id UNION ALL
  SELECT 'retail.purchasing' UNION ALL
  SELECT 'retail.suppliers' UNION ALL
  SELECT 'retail.labels'
)
WHERE b.deleted_at = '';

-- Keep old installations coherent while the old setup screen still writes
-- settings booleans. Explicit user/profile capability overrides are protected:
-- these triggers update only rows whose source is still 'legacy'.
CREATE TRIGGER IF NOT EXISTS trg_business_capabilities_settings_update
AFTER UPDATE OF ai_enabled, whatsapp_enabled, android_enabled, rooms_enabled, tables_enabled, qr_menu_enabled ON settings
WHEN NEW.deleted_at = ''
BEGIN
  UPDATE business_capabilities
  SET is_enabled = NEW.whatsapp_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id AND capability_id = 'service.whatsapp' AND source = 'legacy';

  UPDATE business_capabilities
  SET is_enabled = NEW.android_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id AND capability_id = 'service.android' AND source = 'legacy';

  UPDATE business_capabilities
  SET is_enabled = NEW.ai_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id AND capability_id = 'service.ai' AND source = 'legacy';

  UPDATE business_capabilities
  SET is_enabled = NEW.rooms_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id
    AND capability_id IN ('accommodation.rooms', 'accommodation.reservations', 'accommodation.stays', 'accommodation.folio')
    AND source = 'legacy';

  UPDATE business_capabilities
  SET is_enabled = NEW.tables_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id
    AND capability_id IN ('food_service.tables', 'food_service.reservations', 'food_service.orders', 'commerce.sales')
    AND source = 'legacy';

  UPDATE business_capabilities
  SET is_enabled = NEW.qr_menu_enabled, updated_at = NEW.updated_at
  WHERE business_id = NEW.business_id
    AND capability_id IN ('food_service.menu', 'channel.qr_menu', 'commerce.catalog', 'commerce.inventory')
    AND source = 'legacy';
END;

CREATE TRIGGER IF NOT EXISTS trg_business_capabilities_business_type_update
AFTER UPDATE OF business_type ON business
WHEN NEW.deleted_at = ''
BEGIN
  UPDATE business_capabilities
  SET is_enabled = CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END,
      updated_at = NEW.updated_at
  WHERE business_id = NEW.id
    AND capability_id IN ('retail.barcode', 'retail.purchasing', 'retail.suppliers', 'retail.labels')
    AND source = 'legacy';
END;

CREATE VIEW IF NOT EXISTS enabled_business_capabilities AS
SELECT business_id, capability_id, source, updated_at
FROM business_capabilities
WHERE is_enabled = 1;
