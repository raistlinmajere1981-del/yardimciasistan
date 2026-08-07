-- Ödenmiş bir restoran adisyonu geri alınırsa otomatik kasa gelirini de görünür toplamdan çıkar.
-- Adisyon yeniden paid durumuna gelirse 022 içindeki upsert tetikleyicisi aynı kaydı tekrar etkinleştirir.

CREATE TRIGGER IF NOT EXISTS trg_unpaid_table_order_finance_update
AFTER UPDATE OF status, updated_at ON table_orders
WHEN OLD.status = 'paid' AND NEW.status != 'paid'
BEGIN
  UPDATE finance_entries
  SET deleted_at = NEW.updated_at, updated_at = NEW.updated_at
  WHERE source_type = 'restaurant_order'
    AND source_id = NEW.id;
END;
