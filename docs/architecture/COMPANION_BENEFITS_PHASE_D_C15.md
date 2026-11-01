# Companion benefits spending — C15 contract proposal

Status: design only; mobile points and coupon spending remains disabled. This
note does not authorize implementation or override the canonical benefits and
transaction contracts in `COMMERCE_BENEFITS_PHASE_A.md`.

## Authority and scope

- A future spend requires an explicit, separately managed, default-deny spend
  authorization for the active paired device and business/customer scope. Admin
  role, sale completion, `customer.view`, and the existing read-only balance
  grant must not imply it. Recheck credentials, capabilities, grant and customer
  eligibility at authoritative confirmation, including revocation.
- Desktop resolves current products, quantities, currency, customer and prices
  through the canonical sale owner. Bind the quote and command to that scope,
  rule revisions and device/business identity; a phone price preview or balance
  read is neither reservation nor authority. Reject stale or mismatched scope.

## Transaction, replay and offline

- Define a versioned command and authoritative quote/reservation/confirmation
  contract before UI exposure. Stable action identity plus a canonical fingerprint
  must distinguish exact replay from conflicting reuse. Revalidate the expected
  quote and reservation at confirmation; quote alone cannot authorize spending.
- The existing Android action transaction owns sale, inventory, actual Finance,
  benefits commit, durable publication and action receipt. Borrow its synchronous
  transaction via the existing parent-transaction adapter; never start a nested
  benefits transaction or independently commit a settlement. Any failure rolls
  back the parent writes. Preserve existing independently committed coupon-attempt
  authorization and its rate-limit semantics, where applicable.
- Use the existing durable action outbox and authoritative receipt/ACK, not a
  second queue. A pending or offline intent is not a successful redemption;
  unavailable authority, expired reservation or revoked authorization fails closed.
  Exact replay returns the original authoritative result without double spending;
  mismatched intent is rejected. No optimistic balance or financial posting.

## Coupons and refunds

- Treat coupon codes as transient secrets: do not place them in durable outboxes,
  receipts, logs or projections. A safe mobile transport and replay/fingerprint
  design must be explicitly resolved before coupons can be enabled; do not invent
  a persistence exception. Enforce canonical family, customer, expiry, limits and
  attempt authorization on Desktop.
- Full refunds use the canonical sale/refund owner and original immutable benefits
  settlement: reverse eligible points and coupon effects exactly once alongside
  inventory and actual cash Finance, atomically and idempotently. No client-forged
  reversal amount, separate mobile ledger, double grant or cash refund of points.
  Partial-refund behavior requires a separate explicit contract; do not infer it.

## Next bounded slice

Design and test the server-side spend authorization and revocation boundary,
including separate balance-view and admin-negative cases, without enabling a
mobile spend route. Resolve credential and coupon-secret handling before any
quote/confirm integration. Real paired-device, offline, replay, refund and ACK
end-to-end coverage remains required before exposing spending.
