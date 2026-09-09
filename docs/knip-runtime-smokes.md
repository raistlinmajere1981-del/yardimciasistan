# Knip and compiled runtime smokes

The Electron smokes load `apps/desktop-app/dist-electron/*.js` so they exercise
the actual CommonJS build. Knip does not connect all of these imports to the
TypeScript exports: the desktop workspace's default `tsconfig.json` describes
the renderer, while `tsconfig.electron.json` defines the Electron output.

`knip.json` excludes only declarations tagged `@compiledSmoke` from export
reporting. Each tag names its current consuming smoke:

| Export | Consumer in `scripts/` |
| --- | --- |
| `projectAndroidMarketSnapshot` | `smoke-market-android-foundation.mjs` |
| `MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS` | `smoke-web-connection-test.mjs` |
| `supportsAndroidDevicePermissionSync` | `smoke-automatic-sync.mjs` |
| `createSyncFetchWithTimeout` | `smoke-sync-timeout.mjs` |

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
