# Market Workspace — Stage 8B

Status: closed and verified on `refactor/market-workspace-v2`.

## Ownership

- The Market page remains the operational lens for Quick Sale, Products, Phone Carts, Inventory, Purchasing and Labels.
- Existing catalog products open the canonical Product Workspace.
- The Products mode owns discovery, categories and compact new-product entry; it no longer contains a second persistent Product editor.
- Product remains distinct from Menu Item, Stock Movement, Purchase and Sale.
- Existing commerce IPC, runtime, store, SQLite schema and transaction boundaries remain authoritative.

## Product Workspace

Canonical modes:

```text
Bilgiler | Stok (capability-gated) | Görsel
```

Product form conversion and shared fields are centralized. Existing products open the canonical workspace. New products and Open Food Facts handoffs use compact create, then open the saved entity in Product Workspace.

Product save/create continuations are generation-guarded so an unmounted or replaced surface cannot apply stale UI state. Catalog reloads are generation-guarded, and a newly saved product is retained in the shared catalog projection until an authoritative reload includes it.

## Quick Sale lifetime

Quick Sale remains conditionally mounted so its scanner lifecycle follows the visible mode.

Durable sale-session state lives above the presentation boundary:

- cart and cart reference
- discount
- payment method
- customer
- source phone draft and load warnings
- review recovery
- sale lock / submitting state
- last completed sale projection

Presentation-local state remains inside Quick Sale:

- search and category filter
- keyboard/simulator mode
- simulator input
- scanner readiness/status
- current scan activity and device display

This preserves the cart/session across Market mode changes without leaving keyboard listeners, phone scan mode or polling active while Quick Sale is hidden.

## Scanner and async safety

- Keyboard wedge listeners mount only with Quick Sale.
- Phone scanner activation uses a serialized lease so an older cleanup cannot disable a newer owner.
- Phone polling stops on unmount.
- Barcode lookup continuations are generation-guarded.
- A phone scan batch stops after an external-product handoff.
- Scanner mutations respect the persistent sale lock.
- Draft loading is blocked while a sale is in flight.

## Phone cart recovery

Loading a phone cart remains read-only. A successful sale marks the source draft reviewed.

If review fails, the recovery record survives Market mode changes. Recovery cleanup is draft-id-specific, so a delayed completion cannot clear a different recovery record. A new phone-cart handoff is blocked until the unresolved recovery is completed, preserving the single-recovery-slot invariant.

Retrying recovery only calls the draft-review operation; it never repeats the sale.

## Verification

Stage closure passed locally:

```text
npm run typecheck
npm run smoke:workspace-platform
node scripts/smoke-market-quick-sale-contract.mjs
node scripts/smoke-market-quick-sale-session.mjs
node scripts/smoke-market-customer-credit-ui-contract.mjs
node scripts/smoke-market-customer-credit-whatsapp.mjs
node scripts/smoke-market-companion-desktop-inbox.mjs
node scripts/smoke-market-live-scanner-contract.mjs
node scripts/smoke-market-sale-runtime.mjs
node scripts/check-modular-foundation.mjs
npm run lint:strict
npm run knip:strict
npm run architecture:audit
npm run design:audit:strict
npm run pilot:check
git diff --check
npm run check:linux
```

Final Astra review: `STAGE8B_FINAL=pass`.
