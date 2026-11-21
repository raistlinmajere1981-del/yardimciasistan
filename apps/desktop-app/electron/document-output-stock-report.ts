import type { PrintStockReplenishmentInput } from "@yardimci-asistan/shared";
import type { StockReplenishmentRow } from "./stock-replenishment";

/** Never trust renderer-supplied names, amounts, order or even existence of IDs. */
export function selectStockReportRows(rows: StockReplenishmentRow[], raw: unknown): StockReplenishmentRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("DOCUMENT_STOCK_INPUT_INVALID");
  const input = raw as PrintStockReplenishmentInput;
  if (input.scope === "all" && Object.keys(input).length === 1) {
    if (!rows.length || rows.length > 10000) throw new Error("DOCUMENT_STOCK_EMPTY");
    return rows;
  }
  if (input.scope !== "selected" || Object.keys(input).length !== 2 || !Object.hasOwn(input, "productIds")
      || !Array.isArray(input.productIds) || !input.productIds.length || input.productIds.length > 10000) {
    throw new Error("DOCUMENT_STOCK_INPUT_INVALID");
  }
  const wanted = new Set<string>();
  for (const id of input.productIds) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || wanted.has(id)) throw new Error("DOCUMENT_STOCK_INPUT_INVALID");
    wanted.add(id);
  }
  const selected = rows.filter(row => wanted.has(row.productId));
  if (selected.length !== wanted.size) throw new Error("DOCUMENT_STOCK_CHANGED");
  return selected;
}
const escapeHtml = (value: string | number) => String(value).replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Printable multi-page read-only report; table headers repeat on every A4 sheet.
 * No iframe, untrusted HTML, external assets, or renderer-provided business values. */
export function composeStockReportHtml(rows: StockReplenishmentRow[], businessName: string, date: string): string {
  if (!rows.length || rows.length > 10000) throw new Error("DOCUMENT_STOCK_INPUT_INVALID");
  const labels = ["Kategori", "Ürün", "SKU", "Birim", "Mevcut", "Minimum", "İdeal", "Sipariş"];
  const head = labels.map(label => "<th scope=\"col\">" + escapeHtml(label) + "</th>").join("");
  const body = rows.map(row => "<tr>" + [
    row.categoryName, row.name, row.sku, row.unit, row.quantity,
    row.minimumQuantity, row.idealQuantity, row.suggestedQuantity
  ].map(value => "<td>" + escapeHtml(value) + "</td>").join("") + "</tr>").join("");
  const style = [
    "@page { size: A4 landscape; margin: 12mm; }",
    "html,body { padding:0;margin:0;background:#fff;color:#192638;font:10pt Arial,sans-serif; }",
    "h1 { margin:0 0 5mm;font-size:17pt; }",
    ".meta { display:flex;justify-content:space-between;gap:8mm;margin-bottom:5mm;font-size:9pt;color:#3d5064; }",
    "table { border-collapse:collapse;width:100%;table-layout:fixed; }",
    "thead { display:table-header-group; }",
    "tr { break-inside:avoid;page-break-inside:avoid; }",
    "th,td { padding:2.5mm 2mm; border-bottom:1px solid #bbc7d1;text-align:left;overflow-wrap:anywhere; }",
    "th { background:#e9eef2;font-weight:700; }",
    "td:nth-child(n+5) { text-align:right;font-variant-numeric:tabular-nums; }",
    "td:last-child { font-weight:700; }",
    "th:nth-child(1){width:15%}th:nth-child(2){width:22%}th:nth-child(3){width:13%}",
    "th:nth-child(4){width:8%}th:nth-child(n+5){width:10.5%;text-align:right}",
    ".notice { margin-top:6mm;color:#506174;font-size:9pt; }"
  ].join("\n");
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Stok İhtiyaç Listesi</title><style>'
    + style + '</style></head><body><h1>İdeal Stok İhtiyaç Listesi</h1><div class="meta"><span>'
    + escapeHtml(businessName || "İşletme") + '</span><span>' + escapeHtml(date)
    + " · " + rows.length + ' ürün</span></div><table><thead><tr>' + head
    + '</tr></thead><tbody>' + body + '</tbody></table><p class="notice">'
    + "Önerilen miktar = ideal stok − mevcut stok. Minimum stok yalnız uyarı eşiğidir. "
    + "Bu liste bir satın alma siparişi veya stok hareketi değildir."
    + "</p></body></html>";
}
