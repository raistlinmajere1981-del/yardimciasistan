# Knip and compiled runtime smokes

The Electron smokes load `apps/desktop-app/dist-electron/*.js` so they exercise
the actual CommonJS build. Knip does not connect all of these imports to the
TypeScript exports: the desktop workspace's default `tsconfig.json` describes
the renderer, while `tsconfig.electron.json` defines the Electron output.

`knip.json` excludes only declarations tagged `@compiledSmoke` from export
reporting. Each tag names its current consuming smoke:

| Export | Smoke / runtime consumer |
| --- | --- |
| `projectAndroidMarketSnapshot` | `smoke-market-android-foundation.mjs` |
| `MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS` | `smoke-web-connection-test.mjs` |
| `supportsAndroidDevicePermissionSync` | `smoke-automatic-sync.mjs` |
| `createSyncFetchWithTimeout` | `smoke-sync-timeout.mjs` |
| `buildLocalCompanionMdnsResponse` | `smoke-local-companion-server.mjs` |
| `createCurrentBusinessWebContext` | `smoke-settings-correctness.mjs` |
| `applyBusinessProfileCapabilities` | `smoke-capability-settings-source.mjs` and other capability/profile smokes |
| `CURRENT_DESKTOP_SCHEMA_ERROR` | `smoke-schema-authority.mjs` |
| `currentDesktopSchemaProblem` | `smoke-schema-authority.mjs` |
| `resolveMarketingAi` | `smoke-settings-correctness.mjs` (VM) |
| `archiveExternalProductImage` | `apps/desktop-app/scripts/fixtures/commerce-product-media.cjs` via `smoke-commerce-product-media.mjs` |
| `mapArasShipmentStatus` | `smoke-commerce-aras-provider.mjs` |
| `parseSoapResult` | `smoke-commerce-aras-provider.mjs` |
| `moveRecordId` | `smoke-menu-reorder-contract.mjs` (transpiled source) |
| `reconcileMissingCommerceSaleFinanceInTransaction` | `smoke-market-sale-finance.mjs` and the explicit `reconcile-commerce-sale-finance.mjs` CLI |
| `DEFAULT_TTS_PREFERENCES` | `smoke-desktop-tts.mjs` (transpiled source) |
| `validateTranslationAnswer` | `smoke-public-translations.mjs` |
| `readInstallRecord` | `test-admin-credentials.mjs` (Admin Control Center compiled fixture) |

These are current test APIs, not compatibility promises. Remove a tag and
reassess the export if its consumer is removed. Do not tag unused helpers or
whole modules. Other exports in the same files remain checked.

The customer-credit WhatsApp smoke uses explicit script-relative artifact
imports and a separate `createRequire` anchored at `commerce-ipc.js` for its VM.
This preserves CommonJS resolution inside the compiled IPC without an
unresolved-import exclusion.

Script/test entry and project globs remain explicit. Playwright/Vite entries,
package manifest entries, and Vite configuration files are discovered by Knip;
their redundant explicit patterns are omitted.
