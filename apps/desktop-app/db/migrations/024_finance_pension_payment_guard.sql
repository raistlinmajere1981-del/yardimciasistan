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

-- Daha önce alınmış para varsa anlaşılmış konaklama bedeli bu toplamın altına
-- düşürülemez. Böylece kullanıcı yanlışlıkla negatif kalan / fazla tahsilat
-- durumu oluşturamaz.
CREATE TRIGGER IF NOT EXISTS trg_reservation_total_paid_guard
BEFORE UPDATE OF agreed_total_minor ON reservations
BEGIN
  SELECT CASE
    WHEN NEW.agreed_total_minor < COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0)
      THEN RAISE(ABORT, 'reservation_total_below_paid')
  END;
END;
