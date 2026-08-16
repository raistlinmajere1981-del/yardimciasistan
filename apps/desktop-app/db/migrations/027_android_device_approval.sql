-- Newly discovered Android devices must not become operational before the
-- desktop operator explicitly approves them. Existing devices are left
-- untouched; this trigger only applies to future inserts.
CREATE TRIGGER IF NOT EXISTS android_devices_require_approval_after_insert
AFTER INSERT ON android_devices
WHEN NEW.is_active = 1
BEGIN
  UPDATE android_devices
  SET is_active = 0
  WHERE id = NEW.id;
END;
