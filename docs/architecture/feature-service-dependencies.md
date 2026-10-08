# Feature and service dependency contract

D-048 is the domain decision for this contract. Workflow requirements are owned by
`packages/shared/types/business-capabilities.ts`; service availability is owned by
`packages/shared/types/business-service-ownership.ts`. Neither Settings nor navigation
maintains another dependency graph.

## User-visible features

Every optional feature below is independently selectable as a root in its allowed
profiles. Selecting it resolves the prerequisites automatically; selecting OFF on a
visible prerequisite removes its selected transitive dependents. Required profile
workflows have no optional checkbox. Configuration is retained for every OFF action.

| Feature | Automatic prerequisites (transitive) | Relevant services | OFF behavior |
| --- | --- | --- | --- |
| Requests | Customers | Customer WhatsApp Web/Cloud; independent activation | Request work hidden/gated; customer messaging remains available |
| Marketing | None | Instagram, Website transport; optional AI | Campaign roots cascade OFF; Instagram/SMS activation OFF; canonical Website withdrawal; editorial intent retained |
| WhatsApp / SMS Campaigns | Customers, Marketing | SMS; shared operational WhatsApp Cloud; optional AI | Campaign background delivery gated OFF; SMS activation OFF; Marketing drops only if it was automatic; Cloud remains for Customer messages |
| Room reservations | Rooms | KBS belongs to Stays, not reservations | Reservation surfaces/actions OFF; stays and KBS unaffected |
| Table reservations | Tables | No exclusive provider | Reservation surfaces/actions OFF; table orders unaffected |
| QR Menu | Menu, Catalog | Web transport | Canonical menu publication withdrawal; Menu remains as a required restaurant workflow |
| Inventory tracking | Catalog | No exclusive provider | Stock operations OFF; required Catalog/Menu remain |
| Online Sales | Orders, Catalog | Delivery/Shipping | Online catalog withdrawal; delivery/provider activation OFF only when Wholesale no longer requires them |
| Wholesale | Customers, Orders, Catalog | Dealer portal, Delivery/Shipping | Dealer portal OFF/access revoked through its canonical trigger; shared delivery survives Online Sales |
| Purchasing | Inventory, Catalog | No exclusive provider | Suppliers roots cascade OFF; Inventory remains if another root or the profile requires it |
| Suppliers | Purchasing, Inventory, Catalog | No exclusive provider | Automatic Purchasing drops unless explicitly selected; anonymous Purchasing remains valid |
| Labels | Catalog | No exclusive provider | Label operations OFF; Catalog remains required for retail |
| Customer Credit | Customers, Sales, Catalog, Finance | Optional WhatsApp Web debt messages | Credit operations OFF; ordinary customer messaging remains available |

Technical foundations are not optional controls: Catalog, Sales, Commerce Orders,
Rooms/Stays/Folio, Tables/Table Orders/Menu and Barcode are supplied by required
workflows or dependency closure. Existing graph edges for Folio -> Rooms/Stays/Finance,
Table Orders -> Tables/Menu, Menu -> Catalog and Barcode/Labels -> Catalog remain.

## Profile matrix

Common options: Requests, Marketing, WhatsApp / SMS Campaigns (providers never auto-activate).

| Profile | Additional user-facing optional roots | Default optional roots |
| --- | --- | --- |
| Pension | Room reservations | Requests, Room reservations |
| Restaurant | Table reservations, QR Menu, Inventory, Online Sales | Requests, Table reservations, QR Menu, Inventory |
| Pension + Restaurant | Union of the above hospitality options | Requests, Room reservations, Table reservations, QR Menu, Inventory |
| Market / Retail / Wholesale | Purchasing, Suppliers, Labels, Customer Credit, Wholesale, Online Sales | Purchasing, Suppliers |

Restaurant Online Sales resolves Commerce Orders/Catalog while retaining Menu. Shared
commerce foundations do not open Sales navigation. Customer Credit and retail tools
cannot enter hospitality; accommodation/table workflows cannot enter pure retail via
renderer capability mutations. A combined hospitality business selects the combined profile.

## Services and retained configuration

| Service | Availability owner | Activation OFF retains |
| --- | --- | --- |
| WhatsApp Web | Customers | Business phone and prepared-message configuration |
| WhatsApp Cloud | Customers (operational messaging + campaigns) | Account ids, encrypted token, verification receipt |
| Birthday messages | WhatsApp Web | Template, time and mode |
| SMS | Campaigns | Sender/IYS configuration, encrypted key/hash, verification receipt |
| Instagram | Marketing | Account id, encrypted token, verification receipt |
| AI | Core customer assistant | Provider profiles/models/URLs, encrypted keys, verification receipts |
| Android | Devices | Device records, permissions and transport settings |
| Delivery/Shipping | Online Sales OR Wholesale | Pickup/shipping choices and provider environment/account/credentials |
| Dealer portal | Wholesale | Customer commercial profiles; revoked web access does not resurrect |
| Product data | Barcode | Provider, automatic lookup and image choices |
| KBS | Stays | Provider/facility/identity configuration and encrypted password |
| Google Reviews | Rooms | Place id, encrypted API key, verification receipt |

Availability unlocks Settings controls. Activation is explicit and requires the existing
provider configuration and main-owned successful test for the same effective configuration
where a test exists. Shipping remains a projection of explicit Delivery + Shipping method,
not an independently enabled Aras provider. Feature ON activates none of these services.
Feature OFF resets unavailable activation in the same transaction and queues withdrawals
through existing publication owners. Re-enabling a feature leaves activation OFF. Profile
changes keep D-046's broader activation reset; Web transport/local network are preserved.

Delivery OFF keeps the Online Sales storefront visible with no delivery methods; guest
orders are rejected. Online Sales OFF withdraws the catalog. Diamond dependencies retain
shared foundations/services until the final owner disappears.

## Draft, persistence and defense

`profileOptions` contains selected roots, not their automatic closure. Checkbox state is
computed from the canonical closure. A short prerequisite note is shown only for automatic
visible prerequisites. No cascade confirmation is opened. Unsaved edits never change
runtime, credentials, publications or DB. Profile preview options stay disabled until Save;
Revert restores the committed root selection. Category ownership/save paths are unchanged.

`business_capabilities.is_selected` separates root intent from effective `is_enabled` so
restart/no-op saves do not turn automatic prerequisites into persistent independent choices.
System capabilities retain `system` source; derived capabilities are `profile`; explicit
optional/service changes are `user`. Setup filters unknown/internal/out-of-profile roots and
resolves closure; direct capability writes reject unsupported profiles and missing dependencies.
Renderer capability IPC cannot bypass the service configuration/test owner or edit technical
foundations. Navigation verifies the same graph against persisted capabilities and fails
closed on incomplete snapshots.

## Removed combinations and verification

Removed: Suppliers without Purchasing, Campaigns without Marketing, profile-external hybrid
rows accepted through capability IPC, and orphan SMS/Instagram/delivery/provider activation.
Catalog/Sales/Orders remain internal foundations; no new technical checkboxes were added.

Tests cover every optional combination/toggle from the registry, shared diamonds, root
provenance, every profile default/transition, draft-only ON/OFF/Revert, restart/no-op,
stale renderer reads, backend payload manipulation, retained credentials, owner withdrawal,
service evidence and Restaurant cross-channel navigation. See the `feature-dependencies`,
`profile-transition-correctness`, `settings` and `sales-navigation` verification checks/domains.

The schema extends the current-schema-only contract; no older database migration is provided.
Remote withdrawal converges through existing durable outboxes, so an offline external site
cannot be synchronously withdrawn. Live provider/device tests remain manual checks.
