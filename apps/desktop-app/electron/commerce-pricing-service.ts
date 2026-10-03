import { DatabaseSync } from "node:sqlite";
import type {
  CommercePriceGroup,
  CommerceResolvedUnitPrice
} from "@yardimci-asistan/shared";

export interface ResolveCommerceProductPriceInput {
  productId: string;
  customerId?: string;
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function activeBusinessId(database: DatabaseSync) {
  const row = database.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  const businessId = String(row?.id ?? "").trim();
  if (!businessId) throw new Error("Aktif işletme bulunamadı.");
  return businessId;
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function resolveCommerceProductPrice(
  databasePath: string,
  input: ResolveCommerceProductPriceInput
): CommerceResolvedUnitPrice {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    return resolveCommerceProductPriceInDatabase(database, businessId, input);
  } finally {
    database.close();
  }
}

export function resolveCommerceProductPriceInDatabase(
  database: DatabaseSync,
  businessId: string,
  input: ResolveCommerceProductPriceInput
): CommerceResolvedUnitPrice {
  const productId = String(input.productId ?? "").trim();
  if (!productId) throw new Error("Fiyat çözümleme için ürün gerekli.");

  const product = database.prepare(`
    SELECT id, sale_price, dealer_price_a, dealer_price_b, currency
    FROM catalog_products
    WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''
    LIMIT 1
  `).get(productId, businessId) as Record<string, unknown> | undefined;
  if (!product) throw new Error("Fiyatı çözümlenecek aktif ürün bulunamadı.");

  const customerId = String(input.customerId ?? "").trim();
  let requestedGroup: CommercePriceGroup = "retail";
  let dealerEligible = false;

  if (customerId) {
    const customer = database.prepare(`
      SELECT
        customers.id,
        commercial.dealer_status,
        commercial.price_group
      FROM customers
      LEFT JOIN customer_commercial_profiles commercial
        ON commercial.customer_id = customers.id
        AND commercial.business_id = customers.business_id
      WHERE customers.id = ?
        AND customers.business_id = ?
        AND customers.deleted_at = ''
      LIMIT 1
    `).get(customerId, businessId) as Record<string, unknown> | undefined;
    if (!customer) throw new Error("Fiyatı çözümlenecek müşteri bulunamadı.");

    const storedGroup = String(customer.price_group ?? "retail");
    requestedGroup = storedGroup === "dealer_a" || storedGroup === "dealer_b"
      ? storedGroup
      : "retail";
    dealerEligible = String(customer.dealer_status ?? "") === "active";
  }

  const salePrice = roundMoney(Number(product.sale_price ?? 0));
  let appliedGroup: CommercePriceGroup = "retail";
  let unitPrice = salePrice;

  if (dealerEligible && requestedGroup === "dealer_a" && product.dealer_price_a != null) {
    appliedGroup = "dealer_a";
    unitPrice = roundMoney(Number(product.dealer_price_a));
  } else if (dealerEligible && requestedGroup === "dealer_b" && product.dealer_price_b != null) {
    appliedGroup = "dealer_b";
    unitPrice = roundMoney(Number(product.dealer_price_b));
  }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error("Ürün fiyatı geçersiz.");
  }

  return {
    productId,
    customerId,
    requestedGroup,
    appliedGroup,
    unitPrice,
    currency: String(product.currency ?? "TRY").trim().toUpperCase() || "TRY",
    fallbackToRetail: requestedGroup !== "retail" && appliedGroup === "retail",
    dealerEligible
  };
}
