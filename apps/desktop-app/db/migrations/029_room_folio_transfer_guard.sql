-- 028 migration'ı daha önce çalışmış kurulumlarda da restoran→oda transfer
-- kaleminin normal folyo silme akışıyla koparılmasını engelle.
CREATE TRIGGER IF NOT EXISTS trg_room_folio_transfer_item_delete_guard
BEFORE UPDATE OF deleted_at ON room_folio_items
WHEN OLD.deleted_at = ''
  AND NEW.deleted_at != ''
  AND EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE folio_item_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'room_folio_table_order_transfer_locked');
END;
