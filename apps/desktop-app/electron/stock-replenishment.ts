import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";

/** Read-only inventory snapshot. Amounts never generate a purchase or a stock movement. */
export interface StockReplenishmentRow {
  productId: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  idealQuantity: number;
  suggestedQuantity: number;
}
const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

function readStockReplenishment(db: DatabaseSync, limit: number): {
  rows: StockReplenishmentRow[]; truncated: boolean
} {
    const enabled = readEnabledBusinessCapabilities(db);
    if (!enabled.includes(C.INVENTORY)) throw new Error("Stok takibi bu işletmede etkin değil.");
    const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
    if (!businessId) throw new Error("Aktif işletme bulunamadı.");
    const records = db.prepare(
      "SELECT p.id,p.name,p.sku,p.category_id,c.name category_name,p.unit,p.ideal_quantity,p.minimum_quantity," +
      " COALESCE(SUM(CASE WHEN l.id IS NOT NULL THEN b.quantity ELSE 0 END),0) stock_quantity FROM catalog_products p" +
      " LEFT JOIN catalog_categories c ON c.id=p.category_id AND c.business_id=p.business_id AND c.deleted_at=''" +
      " LEFT JOIN inventory_balances b ON b.product_id=p.id" +
      " LEFT JOIN inventory_locations l ON l.id=b.location_id AND l.business_id=p.business_id AND l.deleted_at='' AND l.is_active=1" +
      " WHERE p.business_id=? AND p.deleted_at='' AND p.is_active=1 AND p.track_inventory=1 AND p.ideal_quantity>0" +
      " GROUP BY p.id HAVING COALESCE(SUM(CASE WHEN l.id IS NOT NULL THEN b.quantity ELSE 0 END),0)<p.ideal_quantity" +
      " ORDER BY c.name COLLATE NOCASE,p.name COLLATE NOCASE,p.id LIMIT ?"
    ).all(businessId, limit + 1);
    return {truncated: records.length > limit, rows: records.slice(0,limit).map(row => {
      const quantity = roundQuantity(Number(row.stock_quantity));
      const idealQuantity = roundQuantity(Number(row.ideal_quantity));
      return {
        productId:String(row.id),name:String(row.name),sku:String(row.sku),categoryId:String(row.category_id),
        categoryName:String(row.category_name ?? "Kategorisiz"),unit:String(row.unit),
        quantity,minimumQuantity:roundQuantity(Number(row.minimum_quantity)),idealQuantity,
        suggestedQuantity:roundQuantity(Math.max(0,idealQuantity-quantity))
      };
    })};
}

function withStockRead<T>(databasePath: string, select: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA query_only=ON; BEGIN");
    return select(db);
  } finally { db.close(); }
}

/** Desktop returns the whole list, preserving the existing 10,000-row guard. */
export function listStockReplenishment(databasePath: string): StockReplenishmentRow[] {
  return withStockRead(databasePath,db => {
    const result = readStockReplenishment(db, 10000);
    if (result.truncated) throw new Error("10.000 satırı aşan sipariş listesi için kategori seçimi gerekli.");
    return result.rows;
  });
}

/** Bounded Android summary, from the very same SQL and multi-location sum.
 * A truncated flag prevents the phone falsely claiming to export all deficits. */
export function listAndroidStockReplenishment(databasePath: string): {
  rows: StockReplenishmentRow[]; truncated: boolean
} {
  return withStockRead(databasePath,db => readStockReplenishment(db, 1200));
}
