import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { DocumentFieldBinding } from "@yardimci-asistan/shared";

type Values = Partial<Record<DocumentFieldBinding, string | null>>;
type Sale = { status: string; total: number; discount_total: number; currency: string; closed_at: string; name: string };
type Item = { product_name: string; barcode: string; quantity: number; unit_price: number; line_total: number };
export interface SaleDocumentSource {
  values: Values;
  lines: Values[];
  /** Kept separately because the current document binding whitelist has no discount field. */
  discount: string;
  /** Barcode is historical too, but the current renderer has no line barcode binding. */
  barcodes: string[];
}

const invalid = (): never => { throw new Error("DOCUMENT_SALE_SOURCE_INVALID"); };
function text(value: unknown, required = false): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (required && !value.trim())) return invalid();
  return value;
}
function minor(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 90_000_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) return invalid();
  return Math.round(value * 100);
}
const money = (value: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);

/** Trusted local scope only. A consistent read is independent of the completed sale transaction.
 * This does not create jobs or prove that the mutable business row is historical. */
export function readSaleDocumentSource(db: DatabaseSync, businessId: string, saleId: string): SaleDocumentSource {
  text(businessId, true); text(saleId, true);
  db.exec("SAVEPOINT sale_document_source");
  try {
    const sale = db.prepare(`SELECT s.status,s.total,s.discount_total,s.currency,s.closed_at,b.name
      FROM commerce_sales s JOIN business b ON b.id=s.business_id
      WHERE s.id=? AND s.business_id=? AND s.deleted_at='' AND b.deleted_at=''`).get(saleId, businessId) as Sale | undefined;
    if (!sale || !["paid", "credit"].includes(sale.status)) return invalid();
    const name = text(sale.name, true), currency = text(sale.currency, true), closed = text(sale.closed_at, true);
    if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf("currency").includes(currency)) return invalid();
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(closed) || !Number.isFinite(Date.parse(closed)) || new Date(closed).toISOString() !== closed) return invalid();
    const total = minor(sale.total), discount = minor(sale.discount_total);
    const items = db.prepare("SELECT product_name,barcode,quantity,unit_price,line_total FROM commerce_sale_items WHERE sale_id=? ORDER BY created_at,id LIMIT 201").all(saleId) as Item[];
    if (!items.length || items.length > 200) return invalid();
    let sum = 0;
    const barcodes: string[] = [];
    const lines: Values[] = items.map(item => {
      const description = text(item.product_name, true);
      barcodes.push(text(item.barcode));
      const unit = minor(item.unit_price), line = minor(item.line_total), quantity = item.quantity;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001 || Math.round(unit * quantity) !== line) return invalid();
      sum += line;
      if (!Number.isSafeInteger(sum)) return invalid();
      return { "line.description": description, "line.quantity": new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity), "line.price": money(unit), "line.total": money(line) };
    });
    if (sum !== total + discount) return invalid();
    const date = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(closed)) + " UTC";
    // A stable local sale reference, never an official invoice/receipt sequence.
    const reference = `SAT-${createHash("sha256").update(JSON.stringify([businessId, saleId])).digest("hex").slice(0, 16).toUpperCase()}`;
    const result: SaleDocumentSource = { values: { "business.name": name, "customer.name": null, "document.number": reference, "document.date": date, "totals.total": money(total), "totals.currency": currency }, lines, discount: money(discount), barcodes };
    db.exec("RELEASE sale_document_source");
    return result;
  } catch (error) { db.exec("ROLLBACK TO sale_document_source; RELEASE sale_document_source"); throw error; }
}
