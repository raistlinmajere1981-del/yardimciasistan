# Restaurant Workspace pilot — Stage 5

## Table control center

`TableWorkspace` keeps one `WorkspaceFrame`/`ModalSurface` with three simultaneous areas:

- Searchable menu with category filters and explicit add controls.
- Active order with quantities, notes, service status and total.
- Table/customer/reservation context, account totals, settlement and eligible room transfer.

`TableOrderEditor` renders menu and ticket panels. `TableAccountPanel` owns the
context/account presentation. `useTableOrderController` remains the canonical guarded
operation owner, including note flushing and stale-response protection. The workspace
coordinates room transfer through the existing financial mutation and dashboard refresh.

Empty-table inspection calls only `getActiveTableOrder`. `Sipariş Aç` explicitly calls
the existing start operation; menu preview is already visible and additions remain
disabled until an active order exists. Daily intents (`order`, `customer`, `account`)
map to this same surface. The header history link temporarily presents closed orders
in the same overlay and `← Masaya dön` restores the surface and drafts.

There are no daily workspace tabs, account navigation buttons, form-reveal flows or
nested room-transfer overlays. Transfer selection is visible whenever payment status,
positive total and capability allow it. The existing requirements (open target folio,
matching currency, exact source order ID and single transfer) remain server-authoritative.

Table is the physical resource; TableOrder is its order lifecycle. Customer relations
belong to Table/reservation context. Paid closes the order and triggers finance effects;
it is not a split-payment or payment-method ledger (D-010). Transfer closes the order
without a second stock deduction or immediate cash receipt. A direct TableOrder/customer
association and table-to-table transfer remain outside the existing domain model.

The customer section always exposes a selector while Customers is enabled. Selection
alone is a draft; `Müşteriyi Bağla`, `Müşteriyi Değiştir` and `Bağı Kaldır` execute
`assignTableCustomer({ tableId, customerId })` through the serialized Table controller.
An empty customer ID removes the relation. The existing reservation card stays separate;
its customer may be suggested only when the table has no customer relation.

`table:assignCustomer` requires an unlocked session, Food Tables and Customers.
`DesktopDatabase` delegates validation/persistence to `table-store`: the table must be
active and undeleted, and a nonempty customer ID must identify an undeleted customer.
Only `current_customer_id`, `updated_at` and `sync_status` change. Reservation links,
reservation records, table status and orders remain untouched. The result uses
`DesktopStatusUpdateResult` and includes the current dashboard on success; the controller
rejects older/equal revisions and responses after workspace disposal. No schema change
is needed. `smoke:table-customer` covers real SQLite and IPC boundaries;
`smoke:restaurant-workspace` covers selection, explicit mutations and response races.

## Current Restaurant operations board

`RestaurantPage` now uses the same `OperationsBoardLayout` geometry proven by Pension while keeping restaurant domain behavior local:

- left: restaurant reservations when enabled,
- center: floor/tables with group and status filters,
- right: restaurant daily work when enabled.

The old `Masalar / Rezervasyonlar / Günlük İşler` page selector is removed. All three operational regions stay visible and scroll independently inside the bounded page viewport. Table Workspace remains the canonical table/order surface and still opens from the center floor without silently creating a second table/order editor.

Reservation and daily-work panels expose their applicable actions directly; hidden `Diğer işlemler` disclosure is not part of the board interaction model.
