import type { CustomerRequest } from "@yardimci-asistan/shared";
import type { AndroidQrOrderPreview, AndroidSnapshotRoom, AndroidSnapshotTable } from "@yardimci-asistan/sync-core";

const isPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
const boundedText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Display-only projection. Never send QR tokens, signatures, stay IDs, or
 * request-order verification fields to an Android snapshot. */
export function projectAndroidQrOrderPreview(
  request: Pick<CustomerRequest, "request_type" | "table_id" | "room_id" | "order_items">,
  rooms: readonly Pick<AndroidSnapshotRoom, "id" | "name" | "number">[],
  tables: readonly Pick<AndroidSnapshotTable, "id" | "name">[]
): AndroidQrOrderPreview | undefined {
  const kind = request.request_type === "room_order" ? "room"
    : request.request_type === "table_order" ? "table" : null;
  if (!kind) return undefined;
  const sourceId = boundedText(kind === "room" ? request.room_id : request.table_id, 100);
  const room = kind === "room" ? rooms.find(candidate => candidate.id === sourceId) : undefined;
  const table = kind === "table" ? tables.find(candidate => candidate.id === sourceId) : undefined;
  const sourceLabel = kind === "room"
    ? (boundedText(room?.number, 50) ? "Oda " + boundedText(room?.number, 50)
      : boundedText(room?.name, 100) || "Oda (arşiv)")
    : boundedText(table?.name, 100) || "Masa (arşiv)";

  const rows = request.order_items;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 20) {
    return {decision_ready:true,kind, source_id: sourceId, source_label: sourceLabel,
      items: [], total: 0, currency: "", invalid_items: true};
  }
  let currency = "";
  let totalMinor = 0;
  let totalQuantity = 0;
  const items: AndroidQrOrderPreview["items"] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.name !== "string"
      || typeof row.quantity !== "number" || !Number.isSafeInteger(row.quantity)
      || row.quantity < 1 || row.quantity > 20 || !isPrice(row.unit_price)
      || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)
      || typeof row.note !== "string" || row.note.length > 500) {
      return {decision_ready:true,kind, source_id: sourceId, source_label: sourceLabel,
        items: [], total: 0, currency: "", invalid_items: true};
    }
    totalQuantity += row.quantity;
    if (totalQuantity > 60 || (currency && currency !== row.currency)) {
      return {decision_ready:true,kind, source_id: sourceId, source_label: sourceLabel,
        items: [], total: 0, currency: "", invalid_items: true};
    }
    currency = row.currency;
    const unitMinor = Math.round(row.unit_price * 100);
    totalMinor += unitMinor * row.quantity;
    items.push({
      name: boundedText(row.name, 120) || "Ürün",
      quantity: row.quantity,
      note: boundedText(row.note, 300),
      unit_price: unitMinor / 100,
      currency
    });
  }
  return {decision_ready:true,kind, source_id: sourceId, source_label: sourceLabel,
    items, total: totalMinor / 100, currency, invalid_items: false};
}
