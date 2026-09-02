-- Keep SQLite as the final authority for catalog uniqueness, but surface
-- domain-level messages before the partial unique indexes fire. This keeps
-- every caller (Desktop, future Android/retail IPC, imports) consistent without
-- depending on SQLite's index-name formatting, which varies by runtime.

CREATE TRIGGER IF NOT EXISTS trg_catalog_products_barcode_insert_guard
BEFORE INSERT ON catalog_products
WHEN NEW.barcode != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND barcode = NEW.barcode
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu barkod başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_products_barcode_update_guard
BEFORE UPDATE OF business_id, barcode, deleted_at ON catalog_products
WHEN NEW.barcode != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND barcode = NEW.barcode
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu barkod başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_products_sku_insert_guard
BEFORE INSERT ON catalog_products
WHEN NEW.sku != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND sku = NEW.sku
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu stok kodu başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_products_sku_update_guard
BEFORE UPDATE OF business_id, sku, deleted_at ON catalog_products
WHEN NEW.sku != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND sku = NEW.sku
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu stok kodu başka bir üründe kullanılıyor.');
END;
