# C17f — scoped legacy data audit

Scope: Desktop database startup and `firm-template/web-module` source, including
explicit migration/backfill/legacy markers and old-schema adaptation. This is not
a repository-wide proof of absence. No production code or data was removed.

| Path | Evidence and decision |
| --- | --- |
| `apps/desktop-app/electron/database.ts` | `initialize()` executes `apps/desktop-app/db/schema.sql` only for an empty database, then calls `assertCurrentDesktopSchema`; no startup data migration found in this path. Keep. |
| `apps/desktop-app/electron/desktop-database-compatibility.ts` | Compares the current SQLite catalog, including trigger definitions, against the canonical schema and rejects mismatches; it does not upgrade them. Keep the requested verifier. `scripts/smoke-android-sale-source-schema-compatibility.mjs` exercises the rejection. |
| `apps/desktop-app/electron/desktop-startup-data.ts`, `apps/desktop-app/electron/clean-start.ts` | Active user-confirmed clean-start flow now permanently deletes disposable local data, obsolete `legacy-data`, and app backup artifacts; it no longer writes an archive or manifest. The canonical schema validator and explicit `--clean-start` confirmation remain. Keep; no clean-start operation was run in this audit. |
| `apps/desktop-app/electron/kbs-settings.ts` | `backfillActiveArrivalNotifications` is called when KBS is enabled to create notifications for active stays, not a startup/schema migration. `scripts/smoke-schema-authority.mjs` identifies it as live opt-in behavior. Keep. |
| `apps/desktop-app/electron/product-image-reader.ts` | Cover-only image fallback is an active read projection, not a data-writing backfill; usage and current image behavior must be assessed separately. Keep. |
| `firm-template/web-module/lib/storage.php` | Active PDO SQLite store initializes current tables with `CREATE TABLE IF NOT EXISTS` and sync metadata. No `ALTER TABLE` or explicitly named migration/backfill found in the scoped scan. Keep canonical storage and API. |
| `firm-template/web-module/api/sync.php` | `reset_runtime` actively removes `data/*.legacy-backup-v1`; `scripts/smoke-web-module-menu.mjs` creates one in a temporary module and asserts its removal. This is legacy cleanup, but **not proven unused**; removing it changes reset behavior. Keep. |
| `firm-template/web-module/data/.htaccess`, `firm-template/web-module/data/ai-conversations.json` | Both are tracked and explicitly required by `scripts/package-web-module.mjs`; the latter is reset to `[]` by the active API. Keep. `git ls-files` listed only these two tracked data files. |
| `firm-template/web-module/README.md` | Documents current test-stage schema without historical migration/fallback. Keep. |

Conclusion: no data-migration/backfill shim in the inspected scope was shown by
tests to be unused, so none was removed. The owner reports old pilot data and
untracked template legacy backups already deleted; this audit did not inspect or
alter deployed sites or reset any database. Further removal requires an explicit
behavior decision and targeted tests, particularly for the active reset cleanup.
