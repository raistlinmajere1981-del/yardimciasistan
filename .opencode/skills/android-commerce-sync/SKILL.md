---
name: android-commerce-sync
description: Safely align Yardimci Asistan Android Companion and Dealer commerce, pricing, benefits, offline outbox and authoritative desktop/site transactions.
---

# Android commerce compatibility

Use only for Android Companion or Dealer sales, cart, stock, credit, coupon/points, price and offline-order changes.

1. Read `AGENTS.md`, `docs/dev/CONTINUATION_BACKLOG_2026-10-29.md` and `docs/architecture/COMMERCE_BENEFITS_PHASE_A.md`; inspect only directly affected canonical transaction owner and API contracts.
2. Keep Companion and Dealer separate. Desktop remains the authority for Companion financial mutations; dealer web/site remains authoritative for dealer-specific visibility, price, catalog revision, benefits policy and order acceptance. Phone-side price is a hint, never final authority.
3. Preserve the existing ActionOutbox, server receipt/idempotency, retry and transaction owner; do not add parallel sync paths, nested transactions, optimistic points redemption or client-forged discount/total fields. Never promote a Phase C/D feature to UI before server contract and server-side tests exist.
4. Work in one bounded slice (20–30 minutes maximum), with a stable owner of files and the same OpenCode session for follow-ups; avoid unrelated admin/effect/desktop appearance and web deploy edits.
5. Run only specific Android Gradle unit tests and the relevant smoke tests, `git diff --check`; do not run full verify, installers, pre-main, release, deploy, commit or push.
6. Report exact changed files, test results, unresolved authorization/offline scenarios and the next smallest slice. Avoid claiming end-to-end integration from unit/smoke tests.
