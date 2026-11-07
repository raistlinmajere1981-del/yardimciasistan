import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES as C,
  businessProfileSupportsCapability,
  createId,
  type CommerceOrderFulfillment,
  type CommerceOrderFulfillmentResult,
  type CommerceOrderFulfillmentSettlement,
  type CommerceSale,
  type FulfillCommerceOrderInput
} from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import {
  createCommerceSaleFromOrderSnapshotInTransaction
} from "./commerce-store";
import { getCommerceOrderDetailInTransaction } from "./commerce-order-store";
import { recordCustomerCreditSaleInTransaction } from "./customer-credit-runtime";
import { benefitsAssert } from "./commerce-benefits-engine";
import { benefitsHmac, canonicalBenefitsJson, withCommerceBenefitsTransaction } from "./commerce-benefits-rules";
import { CommerceBenefitsStore } from "./commerce-benefits-store";
import { assertOrderBenefitsQuote, orderBenefitsOperationKey, orderBenefitsPorts, orderBenefitsPreviewInput,
  prepareOrderBenefitsIngress, replayOrderBenefits, type OrderBenefitsAuthority } from "./commerce-order-benefits";

type Row = Record<string, unknown>;
const PAID_METHODS = new Set(["cash", "card", "bank", "other"]);

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function activeBusiness(database: DatabaseSync) {
  const row = database.prepare(`
    SELECT id, profile_id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown; profile_id?: unknown } | undefined;
  const id = String(row?.id ?? "").trim();
  if (!id) throw new Error("Aktif işletme bulunamadı.");
  return { id, profileId: String(row?.profile_id ?? "").trim() };
}

function normalizeSettlement(settlement: CommerceOrderFulfillmentSettlement) {
  if (settlement?.type === "paid") {
    const paymentMethod = String(settlement.paymentMethod ?? "").trim();
    if (!PAID_METHODS.has(paymentMethod)) throw new Error("Sipariş ödeme yöntemi geçersiz.");
    return { type: "paid" as const, paymentMethod };
  }
  if (settlement?.type === "credit") {
    return { type: "credit" as const, paymentMethod: "" };
  }
  if (settlement?.type === "no_payment") {
    return { type: "no_payment" as const, paymentMethod: "none" };
  }
  throw new Error("Sipariş tahsilat tercihi geçersiz.");
}

function requestFingerprint(input: {
  orderId: string;
  settlementType: string;
  paymentMethod: string;
  locationId: string;
}) {
  return JSON.stringify(input);
}

function mapFulfillment(row: Row): CommerceOrderFulfillment {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    orderId: String(row.order_id ?? ""),
    saleId: String(row.sale_id ?? ""),
    operationKey: String(row.operation_key ?? ""),
    settlementType: String(row.settlement_type ?? "") as CommerceOrderFulfillment["settlementType"],
    paymentMethod: String(row.payment_method ?? ""),
    inventoryLocationId: String(row.inventory_location_id ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function mapSale(row: Row): CommerceSale {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    status: String(row.status ?? "paid") as CommerceSale["status"],
    subtotal: Number(row.subtotal ?? 0),
    discountTotal: Number(row.discount_total ?? 0),
    total: Number(row.total ?? 0),
    currency: String(row.currency ?? "TRY"),
    paymentMethod: String(row.payment_method ?? ""),
    source: String(row.source ?? ""),
    openedAt: String(row.opened_at ?? ""),
    closedAt: String(row.closed_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function readFulfillmentResult(
  database: DatabaseSync,
  businessId: string,
  fulfillmentRow: Row
): CommerceOrderFulfillmentResult {
  const fulfillment = mapFulfillment(fulfillmentRow);
  const order = getCommerceOrderDetailInTransaction(database, businessId, fulfillment.orderId);
  if (!order) throw new Error("Tamamlanan sipariş yeniden okunamadı.");
  const saleRow = database.prepare(`
    SELECT *
    FROM commerce_sales
    WHERE id = ? AND business_id = ? AND deleted_at = ''
    LIMIT 1
  `).get(fulfillment.saleId, businessId) as Row | undefined;
  if (!saleRow) throw new Error("Sipariş satış kaydı yeniden okunamadı.");
  return { fulfillment, order, sale: mapSale(saleRow) };
}

export function fulfillCommerceOrder(
  databasePath: string,
  input: FulfillCommerceOrderInput,
  authority?: OrderBenefitsAuthority
): CommerceOrderFulfillmentResult {
  const database = openDatabase(databasePath);
  try {
    let ingress: ReturnType<typeof prepareOrderBenefitsIngress> | undefined;
    let authorizationId: string | null = null;
    if (input.benefits !== undefined) {
      benefitsAssert(authority, "BENEFITS_STAFF_REQUIRED");
      const previewInput = orderBenefitsPreviewInput(input);
      const businessId = activeBusiness(database).id;
      const existing = () => database.prepare("SELECT 1 FROM commerce_order_fulfillments WHERE business_id = ? AND (operation_key = ? OR order_id = ?)")
        .get(businessId, input.operationKey.trim(), input.orderId.trim());
      try {
        ingress = prepareOrderBenefitsIngress(database, previewInput, authority, Boolean(existing()));
        if (!existing()) authorizationId = ingress.authorizeCoupon();
      } catch (error) {
        // Another writer may commit while key I/O or the independent coupon attempt waits.
        // Only the parent fingerprint below can authorize replay of that committed result.
        if (!existing()) throw error;
        ingress = prepareOrderBenefitsIngress(database, previewInput, authority, true);
      }
    }
    return withCommerceBenefitsTransaction(database, Date.now(), tx => {
      const business = activeBusiness(database);
      const enabled = new Set(readEnabledBusinessCapabilities(database));
      if (!enabled.has(C.ORDERS) || !enabled.has(C.SALES)) {
        throw new Error("Sipariş fulfillment için Siparişler ve Satış yetenekleri etkin olmalı.");
      }

      const orderId = String(input.orderId ?? "").trim();
      if (!orderId) throw new Error("Tamamlanacak sipariş gerekli.");
      const operationKey = String(input.operationKey ?? "").trim();
      if (!operationKey || operationKey.length > 180) {
        throw new Error("Fulfillment işlem anahtarı gerekli ve en fazla 180 karakter olmalı.");
      }
      const locationId = String(input.locationId ?? "").trim();
      const settlement = normalizeSettlement(input.settlement);
      const legacyFingerprint = requestFingerprint({
        orderId,
        settlementType: settlement.type,
        paymentMethod: settlement.paymentMethod,
        locationId
      });
      const fingerprint = ingress ? canonicalBenefitsJson({ legacyFingerprint,
        benefits: benefitsHmac(ingress.key, business.id, "desktop-order-fulfillment-request", input.benefits) }) : legacyFingerprint;
      if (ingress) orderBenefitsPorts(authority!.actor, ingress.bound).authorize(database, ingress.bound, "checkout");

      const byOperation = database.prepare(`
        SELECT *
        FROM commerce_order_fulfillments
        WHERE business_id = ? AND operation_key = ?
        LIMIT 1
      `).get(business.id, operationKey) as Row | undefined;
      if (byOperation) {
        if (String(byOperation.request_fingerprint ?? "") !== fingerprint) {
          throw new Error("Aynı fulfillment işlem anahtarı farklı bir istekle kullanılamaz.");
        }
        const result = readFulfillmentResult(database, business.id, byOperation);
        return ingress ? { ...result, benefits: replayOrderBenefits(database, business.id, orderId, authority!) } : result;
      }

      const previous = database.prepare(`
        SELECT *
        FROM commerce_order_fulfillments
        WHERE business_id = ? AND order_id = ?
        LIMIT 1
      `).get(business.id, orderId) as Row | undefined;
      if (previous) {
        throw new Error("Sipariş daha önce farklı bir işlem anahtarıyla tamamlandı.");
      }

      const order = getCommerceOrderDetailInTransaction(database, business.id, orderId);
      if (!order) throw new Error("Sipariş bulunamadı.");
      if (order.order.status !== "confirmed") {
        throw new Error("Yalnız onaylanmış sipariş tamamlanabilir.");
      }

      if (order.order.checkoutSnapshot && (order.order.paymentStatus !== "paid" || input.benefits !== undefined
        || settlement.type !== "paid" || settlement.paymentMethod !== "bank")) {
        throw new Error("Sipariş ödeme onayı gerekli. Kesinleşmiş web siparişi havale kaydıyla tamamlanmalı.");
      }
      if (order.order.total === 0) {
        if (settlement.type !== "no_payment") {
          throw new Error("Sıfır toplamlı sipariş ödeme gerektirmeden tamamlanmalı.");
        }
      } else if (settlement.type === "no_payment") {
        throw new Error("Pozitif tutarlı sipariş için ödeme veya veresiye tercihi gerekli.");
      }

      if (settlement.type === "credit") {
        if (!order.order.customerId) {
          throw new Error("Veresiye fulfillment için siparişte müşteri gerekli.");
        }
        if (!businessProfileSupportsCapability(business.profileId, C.CUSTOMER_CREDIT)
          || !enabled.has(C.CUSTOMER_CREDIT)) {
          throw new Error("Veresiye / Müşteri Hesabı bu işletmede etkin değil.");
        }
      }

      const now = new Date(tx.now).toISOString();
      let benefitsParent: Parameters<typeof createCommerceSaleFromOrderSnapshotInTransaction>[4];
      let benefitsStore: CommerceBenefitsStore | undefined;
      let reservationId = "";
      if (ingress) {
        benefitsAssert(settlement.type === "paid", "BENEFITS_ORDER_PAID_REQUIRED");
        const saleId = createId("sale_");
        benefitsStore = new CommerceBenefitsStore(ingress.key, orderBenefitsPorts(authority!.actor, ingress.bound, saleId));
        const reservation = benefitsStore.reserve(tx, ingress.intent, `${orderBenefitsOperationKey(operationKey)}:reserve`, authorizationId);
        assertOrderBenefitsQuote(order, reservation.quote);
        benefitsAssert(canonicalBenefitsJson(reservation.quote) === canonicalBenefitsJson(input.benefits!.expectedQuote), "BENEFITS_QUOTE_CHANGED");
        benefitsAssert(input.benefits!.paymentAmountMinor === reservation.quote.payableMinor, "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
        reservationId = reservation.reservationId;
        benefitsParent = { saleId, customerId: ingress.intent.customerId, quote: reservation.quote };
      }
      const saleResult = createCommerceSaleFromOrderSnapshotInTransaction(database, {
        subtotal: order.order.subtotal,
        deliveryFee: order.order.deliveryFee ?? 0,
        discountTotal: order.order.discountTotal,
        total: order.order.total,
        currency: order.order.currency,
        paymentMethod: settlement.paymentMethod,
        source: "commerce-order",
        locationId,
        items: order.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal
        }))
      }, settlement.type === "credit" ? "credit" : "paid", now, benefitsParent);

      if (settlement.type === "credit") {
        recordCustomerCreditSaleInTransaction(database, business.id, {
          customerId: order.order.customerId,
          sale: saleResult.sale,
          now,
          note: order.order.note,
          source: "commerce-order"
        });
      }

      const fulfillmentId = createId("commerce_order_fulfillment_");
      database.prepare(`
        INSERT INTO commerce_order_fulfillments (
          id, business_id, order_id, sale_id, operation_key, request_fingerprint,
          settlement_type, payment_method, inventory_location_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fulfillmentId,
        business.id,
        orderId,
        saleResult.sale.id,
        operationKey,
        fingerprint,
        settlement.type,
        settlement.paymentMethod,
        saleResult.inventoryLocationId || null,
        now
      );

      database.prepare(`
        UPDATE commerce_orders
        SET status = 'fulfilled',
            fulfilled_at = ?,
            updated_at = ?
        WHERE id = ? AND business_id = ? AND status = 'confirmed' AND deleted_at = ''
      `).run(now, now, orderId, business.id);

      if(order.order.checkoutSnapshot) {
        database.prepare("UPDATE commerce_orders SET delivery_status='delivered' WHERE id=?").run(orderId);
        database.prepare("INSERT INTO commerce_order_events(id,business_id,order_id,type,actor_id,created_at) VALUES (?,?,?,'order_delivered','desktop-owner',?)")
          .run(`order-delivered:${orderId}`,business.id,orderId,now);
      }

      const fulfillmentRow = database.prepare(`
        SELECT *
        FROM commerce_order_fulfillments
        WHERE id = ?
        LIMIT 1
      `).get(fulfillmentId) as Row | undefined;
      if (!fulfillmentRow) throw new Error("Fulfillment kaydı yeniden okunamadı.");

      const result = readFulfillmentResult(database, business.id, fulfillmentRow);
      return benefitsStore ? { ...result, benefits: benefitsStore.settle(tx, business.id, reservationId,
        `${orderBenefitsOperationKey(operationKey)}:settle`) } : result;
    });
  } finally {
    database.close();
  }
}
