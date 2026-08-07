-- Pansiyon tahsilatının kalan alacağı aşmasını veritabanı seviyesinde de engelle.
-- UI ve servis katmanı aynı kontrolü yapar; bu trigger farklı bir yazma yolundan
-- fazla tahsilat girilmesini önleyen son güvenlik katmanıdır.

CREATE TRIGGER IF NOT EXISTS trg_pension_payment_remaining_guard
BEFORE INSERT ON pension_payments
WHEN NEW.deleted_at = ''
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT agreed_total_minor
      FROM reservations
      WHERE id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0
      THEN RAISE(ABORT, 'reservation_total_required')
    WHEN NEW.amount_minor > COALESCE((
      SELECT remaining_minor
      FROM pension_payment_totals
      WHERE reservation_id = NEW.reservation_id
    ), 0)
      THEN RAISE(ABORT, 'payment_exceeds_remaining')
  END;
END;
