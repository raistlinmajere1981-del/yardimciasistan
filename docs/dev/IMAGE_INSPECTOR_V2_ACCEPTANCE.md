# Image Inspector V2 — local acceptance, 2026-11-07

Owner/session: Codex `01a1b634-b5ef-75a1-9021-4cfe583ec952`. Existing `main` worktrees:
YardımcıAsistan base `2e26033eef636fca11be758fad2561f07bfb6661`, Teknikel base
`c030ce245ebc355a41ab50e16c21dcae44843934`. No OpenCode/child agents, DB writes,
publication schema changes, source reset, push or live deployment. The two pre-existing
Admin effect-release service/test changes were preserved and excluded from staging.

## Result and ownership

[The package decision and integration contract](../../packages/image-inspector/README.md)
is authoritative for this component. `packages/image-inspector/runtime/` owns pixels,
coordinates, state/history, Workers, UI and resource lifetime. Android Gradle reads those
sources directly. Teknikel prepares four byte-identical assets, with a strict four-file
addition to its existing package allowlist. No shared-template or backend injection.

Android retains sampled EXIF-aware decode, HTTPS/disk cache, FileProvider/TakePicture,
OpenDocument and Activity lifecycle. The WebView can read only seven packaged assets and
fixed indexes from the current selected catalog; all other requests/navigation are denied.
No native pixel/gesture implementation remains: `DealerPhotoPixels`, `DealerPhotoTransform`
and `DealerPhotoView` were removed. `DealerActivity` closes an inspection when the authorized
catalog/owner changes, in addition to its existing 401/403 closure.

Teknikel's product card, main detail photo, detail thumbnails and product comparison use
the same inspector. Its old canonical lightbox DOM/CSS and inline comparison transform/
local-file implementation were removed. Commercial metadata, add-to-cart, detail URLs,
favorites, prices, order submission and account fences remain with YaCommerce/site code.
Internal UI labels accept the site's translator and new source messages use its existing
`canonical/locales/tr.json` catalog.

## Evidence

| Requested behavior | Actual verification |
| --- | --- |
| Same algorithm on Android and web | Common RGBA fixture made once from the pre-V2 native Java commit; all five outputs match byte-for-byte in Node, Chromium and real Android WebView. `test/distribution.mjs` also compares source, both site copies and built APK bytes for all four runtime assets. |
| Five display modes | Eleven core tests include exact native golden pixels, alpha/immutability, detail/contrast/edge behavior, geometry, history, input bounds and cancellation. Browser and device execute all five Worker modes. |
| Zoom/rotation/pan | Core anchor/clamp/fit/quarter-turn tests; browser pinch through real CDP touch input and UI controls; real Android MotionEvent pinch plus zoom/rotation controls. |
| Split/overlay/alpha | Independent and linked layers, rotation, pan rules, alignment reset and opacity tested in core/browser; actual Android overlay alpha verified. |
| Photo/filter state | Browser: filter retains geometry, photo change resets geometry and retains filter; fast photo/filter sequence finishes only the latest selection. |
| Bad/large images | Header pixel/axis limits before allocation, corrupt input and 30 MiB file rejection; 3840×2160 image resized to 1600×900 in real Worker. |
| Resource cleanup | Browser Worker counters return to zero, canvas/dialog removal and focus return; native personal path and session files cleared; off-screen initial canvas starts at 1×1, hidden. No Object URLs are allocated. |
| Personal photo privacy | Real Teknikel personal selection/filtering makes no non-GET request; standalone request inventory contains no personal URL/upload. Android denies an attempted off-origin fetch and exposes no upload bridge. |
| Responsive/accessibility | 320/390/1440 px component checks; 390/1440 px actual Teknikel scenarios; mobile split stacks vertically, targets ≥44px, named controls, keyboard, Escape, native dialog focus and reduced motion. Human TalkBack usability remains a manual check. |
| Android offline | Existing cache preseeded with an unreachable fixture-host URL; actual adapter and shared Worker open/filter successfully from disk. No account/catalog/order records are seeded/reset by instrumentation. |
| Native acquisition/EXIF | Real OpenDocument import method with a private JPEG orientation=6 yields 600×800 from 800×600; intercepted TakePicture contract writes fixture bytes through the real FileProvider and reaches the camera result callback. No real camera capture of the owner's surroundings. |
| Access isolation | Selected canonical logout/cross-account regression plus new inspector scenario verifies the modal closes and private cart/catalog are cleared. Android existing session/authorization tests and explicit catalog/owner closure are retained. This is not a claim of immediate revocation while the entire device is offline. |
| Existing commerce | Both compared products can be added separately to the cart; detail navigation remains. Guest/retail checkout and uncertain dealer retry retain existing exact payload/idempotency behavior in selected fixture-based canonical tests. |

The browser additionally verifies an encoded orientation=6 JPEG becomes 600×800 from
800×600 through the shared Worker, preserving aspect ratio during bounded resize.

Actual targeted results:

- Core: **11/11** (`image-inspector-core`); verification registry: **10/10**.
- Browser component: **3 viewport scenarios passed**, no uncaught errors. Latest canonical
  registry report: `artifacts/verify/2026-11-07T14-14-51-288Z.json`.
- Android: **70 unit tests, 0 failures/errors**; `lintDebug`, `assembleDebug` and
  `assembleDebugAndroidTest` passed. This build result is separate from device evidence.
- Device: Samsung **SM-J700F**, Android **13**, installed Android WebView Dev **158.0.8106.0**,
  `/proc/meminfo` total **1,394,044 KiB**. The instrumentation passed the checks listed in
  `artifacts/image-inspector/android.txt`. Five sequential filter interactions took
  **2115 ms including polling/control waits**; app-host PSS **97,510 KiB**, host native
  allocated heap **33,327,160 bytes**. Renderer-process memory is not included in this
  host PSS figure; no claim about all Android/WebView versions or peak renderer memory.
- Latest browser large-image sample: decode **1418 ms**, edge filter **1657 ms**, **294** UI
  timer ticks across the operation. Host-load variation was observed; this is one sample,
  not a latency guarantee. `artifacts/image-inspector/performance.json` is reproducible.
- Teknikel: **2** new image-inspector commercial scenarios; **4** selected theme/gallery
  scenarios; **5** existing metadata/isolation/checkout/retry scenarios; **11** canonical
  cutover/package tests and **1** shared-source/package test passed.
- Targeted JS ESLint, PHP lint for both changed page templates, both mirror checks and
  `git diff --check` passed. No large combined suite, release suite or installer build.

## Reviewable artifacts and remaining manual scope

Development APK: `apps/dealer-android-app/build/outputs/apk/debug/yardimci-asistan-bayi-debug.apk`
(**debug**, installed for device verification; not a signed release/update rollout).
Teknikel local package: `/home/raistlin/YardimciWorkspace/teknikel_web/.test-artifacts/site-package-pHPsdH/`
(**183 allowlisted files**, with release receipt and SHA256SUMS; no SSH/HTTP deploy).
Browser screenshots/JSON: `artifacts/image-inspector/` and Teknikel
`.test-artifacts/canonical-commerce/image-inspector-{personal,products}-{390,1440}.png`.

Cross-origin images still require their media server's CORS permission. The engine
reports a readable error when readback is denied; it does not create an unsafe proxy.
Device hardware camera capture, human TalkBack review, long session/peak renderer-memory
profiling and other WebView versions remain manual release checks. Existing native
camera intent/result behavior was verified with fixtures, not called hardware testing.
The owner's broad gate, if preparing a release, is `npm run verify:pre-main`; it was not
run because the working contract reserves large suites for the owner.

The pre-existing root `teknikel_web/assets/{site,compare,comparison-model}.js` files are
**already retired**, Apache-blocked and excluded from the active package. Their exact
bytes are required by `scripts/lib/site-release-policy.mjs::retirementPreview` and
Teknikel's approved `scripts/retired-paths.json` hashes. They were not edited/deleted as
part of the active-view replacement, preserving the mandated deploy preflight. They are
not a second working runtime. Physically deleting that quarantined ownership evidence
requires a separate retirement-policy change; it is not retained as a future fallback.
