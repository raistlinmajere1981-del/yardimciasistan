-- Legacy customer writers belong to the installation's active business.
ALTER TABLE customers ADD COLUMN business_id TEXT REFERENCES business(id);
UPDATE customers SET business_id = (
  SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1
);
CREATE TRIGGER trg_customer_business_insert
AFTER INSERT ON customers WHEN NEW.business_id IS NULL
BEGIN
  UPDATE customers SET business_id = (
    SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1
  ) WHERE id = NEW.id;
END;

CREATE UNIQUE INDEX idx_customers_business_id ON customers(business_id, id);
CREATE UNIQUE INDEX idx_commerce_sales_business_id ON commerce_sales(business_id, id);

-- Upgrade existing Market installations without overriding explicit preferences
-- or enabling a dependent feature when sales was explicitly disabled.
INSERT OR IGNORE INTO business_capabilities
  (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT b.id, 'commerce.customer_credit', 1, 'profile', b.created_at, b.updated_at
FROM business b
WHERE b.deleted_at = '' AND b.profile_id = 'market'
  AND (SELECT COUNT(*) FROM business_capabilities c WHERE c.business_id = b.id
    AND c.is_enabled = 1 AND c.capability_id IN
      ('core.customers', 'commerce.sales', 'core.finance', 'commerce.catalog')) = 4;

CREATE TABLE customer_credit_entries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  customer_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_minor INTEGER NOT NULL
    CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0 AND amount_minor <= 999999999999),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('credit_sale', 'payment', 'adjustment_debit', 'adjustment_credit')),
  sale_id TEXT,
  payment_method TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'desktop',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id),
  FOREIGN KEY (business_id, sale_id) REFERENCES commerce_sales(business_id, id),
  CHECK ((direction = 'debit' AND entry_type IN ('credit_sale', 'adjustment_debit'))
    OR (direction = 'credit' AND entry_type IN ('payment', 'adjustment_credit'))),
  CHECK ((entry_type = 'credit_sale' AND sale_id IS NOT NULL)
    OR (entry_type != 'credit_sale' AND sale_id IS NULL)),
  CHECK ((entry_type = 'payment' AND payment_method IN ('cash', 'card', 'bank', 'other'))
    OR (entry_type != 'payment' AND payment_method = '')),
  CHECK (entry_type NOT IN ('adjustment_debit', 'adjustment_credit') OR length(trim(note)) > 0)
);

CREATE UNIQUE INDEX idx_customer_credit_sale_unique
  ON customer_credit_entries(business_id, sale_id) WHERE entry_type = 'credit_sale';
CREATE INDEX idx_customer_credit_account_history
  ON customer_credit_entries(business_id, customer_id, occurred_at DESC, created_at DESC, id DESC);
CREATE INDEX idx_customer_credit_account_currency
  ON customer_credit_entries(business_id, customer_id, currency);
CREATE INDEX idx_customer_credit_last_payment
  ON customer_credit_entries(business_id, customer_id, occurred_at DESC, created_at DESC, id DESC)
  WHERE entry_type = 'payment';

-- Derived view only: there is no mutable balance field.
CREATE VIEW customer_credit_balances AS
SELECT business_id, customer_id, currency,
  SUM(CASE direction WHEN 'debit' THEN amount_minor ELSE -amount_minor END) AS amount_minor
FROM customer_credit_entries GROUP BY business_id, customer_id, currency;

CREATE TRIGGER trg_customer_credit_validate_insert
BEFORE INSERT ON customer_credit_entries
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c JOIN business b ON b.id = c.business_id
    WHERE c.id = NEW.customer_id AND c.business_id = NEW.business_id
      AND c.deleted_at = '' AND b.deleted_at = ''
  ) THEN RAISE(ABORT, 'Veresiye için kayıtlı aktif müşteri gerekli.') END;
  SELECT CASE WHEN NEW.direction = 'credit' AND NEW.amount_minor > COALESCE((
    SELECT amount_minor FROM customer_credit_balances
    WHERE business_id = NEW.business_id AND customer_id = NEW.customer_id AND currency = NEW.currency
  ), 0) THEN RAISE(ABORT, 'Tutar mevcut veresiye borcunu aşamaz.') END;
  SELECT CASE WHEN NEW.direction = 'debit' AND NEW.amount_minor + COALESCE((
    SELECT amount_minor FROM customer_credit_balances
    WHERE business_id = NEW.business_id AND customer_id = NEW.customer_id AND currency = NEW.currency
  ), 0) > 9007199254740991 THEN RAISE(ABORT, 'Veresiye bakiyesi güvenli sınırı aşıyor.') END;
  SELECT CASE WHEN NEW.entry_type = 'credit_sale' AND NOT EXISTS (
    SELECT 1 FROM commerce_sales s WHERE s.id = NEW.sale_id AND s.business_id = NEW.business_id
      AND s.status = 'credit' AND s.payment_method = '' AND s.deleted_at = ''
      AND s.currency = NEW.currency AND CAST(ROUND(s.total * 100) AS INTEGER) = NEW.amount_minor
  ) THEN RAISE(ABORT, 'Veresiye satış hareketi satışla eşleşmiyor.') END;
END;

CREATE TRIGGER trg_customer_credit_no_update BEFORE UPDATE ON customer_credit_entries
BEGIN SELECT RAISE(ABORT, 'Veresiye hareketi değiştirilemez; düzeltme hareketi ekleyin.'); END;
CREATE TRIGGER trg_customer_credit_no_delete BEFORE DELETE ON customer_credit_entries
BEGIN SELECT RAISE(ABORT, 'Veresiye hareketi silinemez; düzeltme hareketi ekleyin.'); END;

-- Existing finance convention: projection is part of the ledger INSERT's
-- transaction. Any finance error rolls back the payment and vice versa.
CREATE TRIGGER trg_customer_credit_payment_finance_insert
AFTER INSERT ON customer_credit_entries WHEN NEW.entry_type = 'payment'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_credit_' || NEW.id, 'income', NEW.amount_minor, NEW.currency,
    NEW.payment_method, 'other_income', 'Veresiye tahsilatı', NEW.occurred_at,
    'customer_credit_payment', NEW.id, NEW.note, NEW.created_at, NEW.updated_at, '', 'local_only'
  );
END;

CREATE TRIGGER trg_customer_credit_customer_deletion
BEFORE UPDATE OF deleted_at ON customers
WHEN NEW.deleted_at != '' AND EXISTS (
  SELECT 1 FROM customer_credit_balances WHERE customer_id = OLD.id AND amount_minor > 0
)
BEGIN SELECT RAISE(ABORT, 'Bu müşterinin açık veresiye borcu var.'); END;

CREATE TRIGGER trg_customer_credit_customer_ownership
BEFORE UPDATE OF business_id ON customers
WHEN NEW.business_id IS NOT OLD.business_id AND EXISTS (
  SELECT 1 FROM customer_credit_entries WHERE customer_id = OLD.id
)
BEGIN SELECT RAISE(ABORT, 'Veresiye geçmişi olan müşterinin işletmesi değiştirilemez.'); END;

CREATE TRIGGER trg_customer_credit_sale_no_update BEFORE UPDATE ON commerce_sales
WHEN EXISTS (SELECT 1 FROM customer_credit_entries WHERE sale_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Veresiye satışının muhasebe izi değiştirilemez.'); END;
