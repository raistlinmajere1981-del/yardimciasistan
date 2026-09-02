-- Capability runtime v2.
--
-- business_type is retained temporarily as the setup/profile compatibility
-- field, but runtime domain switches now project from business_capabilities.
-- The new profile_id records the preset explicitly. Legacy module/settings
-- booleans remain only as a compatibility projection for renderer code that
-- has not yet been moved to the capability IPC surface.

ALTER TABLE business ADD COLUMN profile_id TEXT NOT NULL DEFAULT '';
UPDATE business
SET profile_id = business_type
WHERE profile_id = '';

-- Retire the v1 legacy mirror. These triggers made settings booleans the source
-- of truth. v2 reverses that relationship for domain capabilities.
DROP TRIGGER IF EXISTS trg_business_capabilities_business_insert;
DROP TRIGGER IF EXISTS trg_business_capabilities_settings_insert;
DROP TRIGGER IF EXISTS trg_business_capabilities_settings_update;
DROP TRIGGER IF EXISTS trg_business_capabilities_business_type_update;

UPDATE business_capabilities
SET source = 'profile'
WHERE source = 'legacy';

-- Fresh businesses are born with a complete, explicit capability snapshot.
-- Absent/disabled capabilities are stored too; this makes inspection and
-- future settings UIs deterministic instead of relying on missing rows.
CREATE TRIGGER trg_cap_v2_business_insert
AFTER INSERT ON business
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO business_capabilities (
    business_id, capability_id, is_enabled, source, created_at, updated_at
  ) VALUES
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

    (NEW.id, 'service.whatsapp', CASE WHEN NEW.business_type = 'other' THEN 0 ELSE 1 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'service.ai', 0, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'service.android', CASE WHEN NEW.business_type = 'other' THEN 0 ELSE 1 END, 'profile', NEW.created_at, NEW.updated_at),

    (NEW.id, 'accommodation.rooms', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.reservations', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.stays', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.folio', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),

    (NEW.id, 'food_service.tables', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.reservations', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.orders', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.menu', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'channel.qr_menu', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),

    (NEW.id, 'commerce.catalog', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'commerce.inventory', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'commerce.sales', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),

    (NEW.id, 'retail.barcode', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.purchasing', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.suppliers', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.labels', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    source = CASE
      WHEN business_capabilities.source = 'user' THEN business_capabilities.source
      ELSE excluded.source
    END,
    updated_at = excluded.updated_at
  WHERE business_capabilities.source != 'user';

  UPDATE business
  SET profile_id = CASE WHEN NEW.profile_id = '' THEN NEW.business_type ELSE NEW.profile_id END,
      modules_json = printf(
        '{"rooms":%s,"tables":%s,"qr_menu":%s,"ai":false,"whatsapp":%s,"android":%s}',
        CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 'true' ELSE 'false' END,
        CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 'true' ELSE 'false' END,
        CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 'true' ELSE 'false' END,
        CASE WHEN NEW.business_type = 'other' THEN 'false' ELSE 'true' END,
        CASE WHEN NEW.business_type = 'other' THEN 'false' ELSE 'true' END
      )
  WHERE id = NEW.id;
END;

-- Changing the setup profile rewrites only profile/system rows. Explicit user
-- capability overrides survive, allowing combinations such as Market + Rooms
-- without inventing a new business_type value.
CREATE TRIGGER trg_cap_v2_business_profile_update
AFTER UPDATE OF business_type ON business
WHEN NEW.deleted_at = '' AND NEW.business_type != OLD.business_type
BEGIN
  UPDATE business
  SET profile_id = NEW.business_type
  WHERE id = NEW.id;

  INSERT INTO business_capabilities (
    business_id, capability_id, is_enabled, source, created_at, updated_at
  ) VALUES
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
    (NEW.id, 'service.whatsapp', CASE WHEN NEW.business_type = 'other' THEN 0 ELSE 1 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'service.ai', 0, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'service.android', CASE WHEN NEW.business_type = 'other' THEN 0 ELSE 1 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.rooms', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.reservations', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.stays', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'accommodation.folio', CASE WHEN NEW.business_type IN ('pension', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.tables', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.reservations', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.orders', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'food_service.menu', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'channel.qr_menu', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'commerce.catalog', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'commerce.inventory', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'commerce.sales', CASE WHEN NEW.business_type IN ('restaurant', 'cafe', 'pension_restaurant', 'market') THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.barcode', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.purchasing', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.suppliers', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at),
    (NEW.id, 'retail.labels', CASE WHEN NEW.business_type = 'market' THEN 1 ELSE 0 END, 'profile', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    source = excluded.source,
    updated_at = excluded.updated_at
  WHERE business_capabilities.source != 'user';

  UPDATE business
  SET modules_json = printf(
    '{"rooms":%s,"tables":%s,"qr_menu":%s,"ai":%s,"whatsapp":%s,"android":%s}',
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'accommodation.rooms' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'food_service.tables' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'channel.qr_menu' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.ai' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.whatsapp' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.android' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END
  )
  WHERE id = NEW.id;
END;

-- The old setup screen still submits modules_json. Treat it as a compatibility
-- output only: any attempted domain switch write is immediately projected back
-- from the capability table.
CREATE TRIGGER trg_cap_v2_modules_projection
AFTER UPDATE OF modules_json ON business
WHEN NEW.deleted_at = ''
BEGIN
  UPDATE business
  SET modules_json = printf(
    '{"rooms":%s,"tables":%s,"qr_menu":%s,"ai":%s,"whatsapp":%s,"android":%s}',
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'accommodation.rooms' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'food_service.tables' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'channel.qr_menu' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.ai' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.whatsapp' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
    CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.android' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END
  )
  WHERE id = NEW.id
    AND modules_json != printf(
      '{"rooms":%s,"tables":%s,"qr_menu":%s,"ai":%s,"whatsapp":%s,"android":%s}',
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'accommodation.rooms' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'food_service.tables' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'channel.qr_menu' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.ai' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.whatsapp' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id = NEW.id AND c.capability_id = 'service.android' AND c.is_enabled = 1) THEN 'true' ELSE 'false' END
    );
END;

-- Service switches are still edited by the existing settings UI. They now act
-- as commands that create explicit user overrides in business_capabilities.
-- Domain booleans (rooms/tables/qr_menu) are deliberately NOT mirrored in this
-- direction anymore.
CREATE TRIGGER trg_cap_v2_service_settings_insert
AFTER INSERT ON settings
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.business_id, 'service.whatsapp', NEW.whatsapp_enabled, 'user', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.android', NEW.android_enabled, 'user', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.ai', NEW.ai_enabled, 'user', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    source = 'user',
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_cap_v2_service_settings_update
AFTER UPDATE OF whatsapp_enabled, android_enabled, ai_enabled ON settings
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
  VALUES
    (NEW.business_id, 'service.whatsapp', NEW.whatsapp_enabled, 'user', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.android', NEW.android_enabled, 'user', NEW.created_at, NEW.updated_at),
    (NEW.business_id, 'service.ai', NEW.ai_enabled, 'user', NEW.created_at, NEW.updated_at)
  ON CONFLICT(business_id, capability_id) DO UPDATE SET
    is_enabled = excluded.is_enabled,
    source = 'user',
    updated_at = excluded.updated_at;
END;
