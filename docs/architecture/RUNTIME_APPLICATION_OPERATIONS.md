# Runtime application operations

The Runtime Boundary Audit SHOULD fixes move persistent sequencing out of the
renderer without changing the departure/payment invariants. They reuse the
existing checkout, folio-payment, sale, credit and reservation validation owners.

## Hospitality

- `checkoutStayWithSettlement` accepts Stay/Room context, a current-account intent,
  optional previous-account IDs and a payment method. Preview balances are not
  mutation arguments. Previous IDs are user selection, not eligibility authority.
- Persisted Room/Stay context is checked before departure. Departure commits even
  when later collection fails. Each account is rechecked for ownership, lifecycle
  and current remaining under its own write transaction.
- `collectRoomFolioPayment` keeps an explicit payment amount as user intent;
  existing payment validation rejects overpayment against persisted remaining.
  Financial closure is a separate committed step, based on the updated balance
  and inactive Stay, and never silently departs an active group.
- Results preserve a committed payment when closure fails (`closure: failed`),
  and report each checkout settlement separately. An unavailable post-payment
  balance is `null`, not an invented zero. Recover through the persisted open
  account; do not blindly resend a payment after an unknown IPC outcome.
- Guest-only departure remains the independent existing `checkoutStayGuest`
  operation. Shared-account settlement is not implicitly added to it.

## Market phone-cart sale

`completeMarketSale` owns canonical sale creation and the subsequent inbox review.
Review is optional inbox lifecycle state (it can also be closed manually), not a
condition for rolling back a successful sale.

For a source draft, sale and `commerce_cart_draft_sales` receipt commit together.
The draft ID is unique; a retry with the same normalized intent returns the same
persisted sale and retries review. A changed intent is rejected. Price resolution,
stock and credit ledger creation remain with their existing transaction owners.
Review failure returns `sale + draftReview: failed`; manual review recovery creates
no sale. An already-sold pending draft cannot load into another Quick Sale cart,
including after a renderer restart or lost response. Non-draft sales do not gain
a new generic idempotency system.

This adds one current-schema table in `apps/desktop-app/db/schema.sql`. The existing
current-schema-only compatibility gate intentionally rejects older databases;
no historical migration chain or automatic reset is introduced.

## Reservation assignment and full edit

`assignReservationRoom({ reservationId, roomId })` reads persisted metadata under
the write lock and delegates booking/resource/conflict validation to the existing
reservation service. Only room assignment, modification time and sync state are
written. Date, guest/adult/child count, notes, customer and request metadata are
not replayed from a renderer DTO. Assignment still does not create a Stay.

Full edit remains `saveManualReservation`. The existing `updatedAt` captured with
the form supplies `expectedUpdatedAt`; a stale form is rejected, including at the
conditional SQL write. Local reservation edits keep distinct modification times
even within one millisecond. This is reservation-specific, not a generic revision
framework; existing callers without a form revision retain their contracts.

All four new ingress channels use the existing authoritative session gate before
their capability checks. Regression coverage lives in
`scripts/smoke-runtime-application-operations.mjs`, the production registration/
preload lock smoke and the existing Pension/Market UI smokes.
