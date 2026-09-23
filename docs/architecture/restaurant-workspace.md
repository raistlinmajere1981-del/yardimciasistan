# Restaurant Workspace pilot — Stage 5

## Before the change: source audit

`RestaurantPage` stacked Today metrics, reservation disclosure, room-transfer panel,
TableOrdersWorkspace and daily tasks. The page owned the order list. TableOrdersWorkspace
owned floor grouping, cards, a wide order drawer, a second selected-order snapshot,
menu/category search, note drafts, request generation and mutations.

| Entry / action | Existing caller → backend |
| --- | --- |
| Inspect / create | `openOrderDrawer` → `getActiveTableOrder` (only if already known), then `openTableOrder`; empty table inspection created an order |
| Add / quantity / remove | Drawer → preload `addTableOrderItem`, `updateTableOrderItemQuantity`, `removeTableOrderItem` → `tableOrder:*` IPC → DesktopDatabase → table-order-service; transactional menu stock and totals |
| Item note | Drawer blur/Enter, not a timer debounce → `updateTableOrderItemNote`; per-item promise, dirty draft preservation, up to four flush passes |
| Order status | Drawer `updateOrderStatus` AND card `runCardOrderAction(payment)` → same backend `updateTableOrderStatus` |
| Paid / cancel | Drawer `closeOrder` AND card `runCardOrderAction(paid)` → `closeTableOrder`; card path bypassed drawer note flushing |
| Table status | Card select → useOperationController.handleUpdateTableStatus → preload → operations IPC → DesktopDatabase → table-store |
| Reservation | RestaurantReservationsWorkspace → ManualRestaurantReservationEditor drawer → useOperationController.handleSaveManualRestaurantReservation → preload / operations IPC → DesktopDatabase → reservation-store |
| Customer | Table.currentCustomerId/currentReservationId are projections; TableOrder has no customer field or association mutation. Reservation creation accepts customerId + optional tableId. QuickCustomerCreator is the existing canonical compact customer form |
| Table → table | No backend operation, preload method or UI operation found |
| Table → room folio | Separate RestaurantRoomTransferPanel → nested confirmation → addRoomFolioManualItem(sourceTableOrderId) → roomFolio:addManualItem → transferTableOrderToRoomFolio |
| History | listTableOrders returns persisted orders sorted by opened_at/created_at; no Table audit-history API |
| Android | action queue → DesktopDatabase applyAndroidAction → android-table-order-actions (open/add/quantity/remove/status/paid/cancel), version/dependency receipts and shared stock/table helpers |

Table is the physical resource; TableOrder is its order lifecycle. Customer relations
belong to Table/reservation context, not a new order customer field. Paid is a close
status, not a payment ledger (D-010). Finance auto entries derive from paid orders and
exclude room-folio transfers; transfer records ensure one source order is transferred
once. Transfer requires payment status, positive amount, open folio, matching currency;
it closes the table/order without a second stock deduction or immediate cash receipt.
IPC capability/session gates and facade/service/storage contracts remain unchanged.

## Stage 5 decisions

Selecting a table is inspection only (D-009). `Sipariş Başlat` is the sole explicit
creation entry. Table Workspace uses Stage 2 full-canvas geometry within shell bounds;
there is no centered toggle. Sidebar and global header remain visible. Floor filters
and mode remain mounted beneath the workspace. No sector registry or entity framework.

Customer mode shows existing table/reservation relationships. Creating a new direct
TableOrder/customer association and table-to-table transfer require future domain
operations and are intentionally absent. Reservation customer/table selection remains
in the canonical bounded reservation form, with QuickCustomerCreator reuse.
