/** Both the card and the workspace use these domain operations. */
export function startTableOrder(tableId: string) {
  return window.yardimciDesktop!.openTableOrder(tableId);
}
export function setTableOrderStatus(orderId: string, status: "preparing" | "served" | "payment") {
  return window.yardimciDesktop!.updateTableOrderStatus(orderId, status);
}
