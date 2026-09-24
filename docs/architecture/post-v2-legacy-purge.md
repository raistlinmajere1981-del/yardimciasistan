# Post-v2 Legacy Purge

Status: **closed and verified** on `refactor/post-v2-legacy-purge`.

This cleanup starts after Application Platform v2 Stage 10. The repository is treated as
the only working copy and historical local user data/settings do not require migration
compatibility. The goal is therefore current-only runtime/schema behavior rather than an
upgrade path from earlier repository states.

## Removed compatibility systems

### Desktop database

- removed `db/migrations/001_baseline.sql` and the migrations directory
- added one current schema source: `apps/desktop-app/db/schema.sql`
- removed the `schema_migrations` ledger/runner
- removed historical development-database relocation and its marker in Stage 10
- removed the old `settings.sync_client_id` handoff; `desktop_sync_identity` is the sole local sync identity
- database smoke renamed from baseline/migration terminology to `smoke-database-schema.mjs`

### Backup / restore

- old manifest `version: 3` + `schema: 001_baseline.sql` compatibility removed
- current backups use `format: yardimci-asistan-backup-v2`
- current manifest fields are mandatory; directory/mtime/count fallbacks for old backups were removed
- pending restore/reset marker no longer carries a compatibility format version
- backup validation checks only positive current-schema contracts

### Hosting / sync

- hosting storage `schema_version` metadata and unsupported-schema upgrade gate removed
- `SyncCapabilitiesSuccess.schema_version` removed
- Android permission-sync support is gated by advertised `features`, not historical hosting schema numbers
- `protocol_version` remains intentionally: it is a live wire-protocol contract, not a database migration marker

### AI settings

- `ai_service_profiles` is the canonical per-service AI configuration source
- removed duplicate/fallback profile fields from `settings`:
  - `ai_model`
  - `ai_project_name`
  - `ai_base_url`
  - `ai_timeout_seconds`
  - `ai_api_key_encrypted`
- setup/profile reads no longer fall back to those old settings columns
- save flow no longer writes AI profile data to two stores

### Business profiles

- removed the historical `cafe -> restaurant` alias
- desktop schema accepts only current profile ids:
  `pension_restaurant`, `pension`, `restaurant`, `market`

### Tests and documentation

- package/build config now ships `db/schema.sql`
- package/Windows/database smokes assert the current schema instead of a migration ledger
- setup/capability smokes no longer retain negative assertions for retired columns,
  `LegacySetupWizard`, `business_type`, `modules_json` or old boolean capability columns
- active setup/architecture/agent documentation now describes a current-schema-only project

## Intentionally retained version-like concepts

These are current contracts, not legacy migration support:

- `protocol_version` in hosting sync transport
- Appearance preference `version: 2`
- Application Architecture Constitution V1 / Domain Decisions V1 document names
- design-audit baseline data
- OpenAI-compatible provider naming

## Current policy

Do not introduce historical database migration chains, old-shape fallbacks, alias mappings
or backup-format compatibility without a new explicit product requirement. Git history is
the archive for retired implementation shapes.

### Follow-up cleanup after verification

- removed the stale Market live-scanner smoke dependency on the retired migration SQL file; runtime SQLite coverage already verifies scan-event persistence/idempotency
- removed dead `normalizeStoredAiBaseUrl`; AI profile reads now use the canonical service-profile/default-url path

- removed the Product Data contract smoke dependency on the retired migration SQL and its duplicate schema-string assertions; current product/settings columns are covered by `smoke-database-schema.mjs`.

### Local-AI exhaustive audit cleanup

- removed `market.product_draft -> market.product_create` compatibility aliases from desktop, Android and hosting permission normalization
- removed Android JVM/smoke coverage that required the retired permission alias; device UI fixtures now use `market.product_create`
- removed v1 OperationCache cleanup keys; current cache clearing only owns current keys
- fixed restored-state republish preparation by removing the stale write to the deleted `settings.sync_client_id` column
- Android device UI cache verification now reads the current `operations_cache_v2` key

- removed deprecated `normalizeTRMobilePhone`; desktop credit sharing and the web widget now use the international phone normalizer directly

- removed Android storage tests that seeded retired v1 outbox/cache keys; remaining tests exercise only the current transport-neutral outbox and per-source revision cache

- removed obsolete `ui_design_plan.md` and `docs/dev/kolay-kullanim-envanteri.md`; both documented retired easy/pro, data-theme and migration-era UI structure and had no live repository references


## Closure verification

Final local verification:

```text
npm run typecheck      → PASS
npm run pilot:check    → 46 passed / 0 failed / 0 skipped
npm run knip:exports   → PASS, no issues
npm run check:linux    → PASS
```

The repository is now treated as current-only for desktop database schema, backup format,
hosting storage capabilities, AI profile persistence, business profile ids and Android
companion storage/permissions. Historical implementation shapes remain available through
Git history rather than runtime compatibility code.

Post-v2 legacy purge is closed.
