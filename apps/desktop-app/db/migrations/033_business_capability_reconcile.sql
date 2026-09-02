-- Final compatibility backfill. This is intentionally separate from 031/032:
-- installations may have run the first capability migration before setup rows
-- existed. Missing rows are filled without touching explicit user/profile
-- overrides.

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
