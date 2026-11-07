# Image Inspector V2

Canonical, dependency-free offline runtime for browser and Android WebView. Its owner is
this package, not YaCommerce, a site theme, Android Activity or the publication backend.
No database/publication schema or price/cart/order logic belongs here.

## Technology decision (2026-11-07)

Inventory: Android's `DealerPhotoViewer` combined five immutable pixel presets, fit/
1–8×/finger-centered zoom, pan, 90° rotation, independent split/overlay transforms,
local camera/gallery, opacity, saved state and cancellable background work.
`DealerImages` owns HTTPS-only public media download, a 30 MB input bound, 64 MB/120-file
disk cache, EXIF correction, sampled decode and thumbnail memory cache. Teknikel's active
`canonical/public/assets/site/catalog.js` had a separate lightbox plus 1–5×/pan/rotation
comparison, local files and product metadata; its root legacy editor is not the active
canonical route. YaCommerce owns validated catalog URLs, account generation fences,
prices, cart and order operations. `web-site-template` owns optional presentation and
must not inject this UI into backend packages or other sites automatically.

| Option | Actual code sharing | Cost / offline / performance |
| --- | --- | --- |
| JS runtime + local WebView | Pixels, geometry, state, worker, gestures and UI | Existing Chromium runtime; packaged assets work offline; bounded worker decode, no bridge bitmap/base64 copies; WebView process overhead must be measured on devices |
| C++/Rust + WASM + JNI | Pixel/geometry code; two UIs and gesture systems | New toolchains/ABI/WASM and native lifecycle; useful if measured JS throughput is insufficient |
| Java + JS implementations | Contract/fixtures only | Two algorithms to maintain; rejected |

Chosen: plain JavaScript with a pure core, disposable Worker jobs and a shared DOM shell.
No runtime download, npm dependency, bundler, JNI, WASM or independently reimplemented
native filters. Android's build reads `runtime/` directly as assets. The site receives
byte-identical prepared copies, checked separately. Filters are verified against golden
RGBA output made once from the old Java at the recorded commit; the same fixture runs
in Node, Chromium and the actual installed Android WebView.

Android retains only platform acquisition/decode/cache and lifecycle. Its native sampled
EXIF decode emits a bounded PNG through an intercepted, session-scoped HTTPS path; JS
owns all display rules after that. Native normalizing decode protects older low-memory
phones from full camera bitmap allocation and preserves existing offline cache files.
The main product/catalog/account UI remains native. Camera uses `TakePicture` and
FileProvider; gallery uses `OpenDocument`. No `getUserMedia` permission bridge is added.

## Integration

```html
<link rel="stylesheet" href="assets/image-inspector/inspector.css">
<script src="assets/image-inspector/core.js" defer></script>
<script src="assets/image-inspector/inspector.js" defer></script>
```

```js
const inspector = window.ImageInspector.open({
  title: product.name,
  mode: 'inspect', // or compare with two items
  items: [{name: product.name, urls: validatedCatalogUrls}],
  opener: document.activeElement,
  onSelect: index => updateProductGallery(index),
  details: host => renderProductFactsAndExistingCommerceActions(host)
});
// Synchronously revoke the view on logout, account change, catalog withdrawal/refresh:
inspector.close();
```

`mount({host,...})` embeds the same view for Android. It returns `session`, `personal(Blob)`,
`personalSource(sessionLocalUrl)`, `snapshot()`, `navigate(step)`, and idempotent `destroy()`.
The host must destroy on detachment. `open` owns native dialog focus trapping/Esc/focus
return. `choosePersonal`, `onPersonalClear` and `onState` are optional platform hooks.
`translate(sourceText)` can use the site's existing UI source catalog; the engine never
fetches translations or treats business fields as UI messages.
`items[].thumbUrls` can supply bounded native thumbnails; ordinary sites use the same
validated sources with serial, resized thumbnail jobs. Accent can use `--ii-accent`.
The caller translates business metadata and supplies its normal authorized commerce
operations; no price, ID, account or permission is interpreted by the engine.

Explicit web preparation (no deployment):

```sh
node packages/image-inspector/sync-web.mjs --apply ../teknikel_web/canonical/public/assets/site
node packages/image-inspector/sync-web.mjs --check ../teknikel_web/canonical/public/assets/site
node ../teknikel_web/scripts/sync-public-assets.mjs --apply
node ../teknikel_web/scripts/sync-public-assets.mjs --check
```

Keep the four runtime files together. `worker.js` loads `core.js` relative to itself.
Another website needs this asset preparation and one caller adapter, not new algorithms.
No shared-template/backend asset manifest is changed for an opt-in consumer.

## Rules and limits

- Normal, Detay (local sharpen/shadow lift), Kod (luma/contrast), Negatif and Kenar
  (Sobel gradient magnitude) are pure immutable RGBA operations. Alpha is preserved.
- Filter change retains zoom/pan/rotation; a different photo retains its filter and
  resets only that layer's geometry. Layout/active-layer changes retain both transforms.
  Rotate refits dimensions and recenters, retaining zoom. Fit resets geometry, retaining
  the filter. Alignment resets both transforms and opacity to 0.5. Independent movement
  is default; linked movement applies the same screen-space operation to both layers.
- Session history contains at most 30 state snapshots, no bitmap/Blob/URL ownership.
  Undo restores state and reloads the selected sources. Personal-source replacement
  discards the previous Blob; returning to inspection clears personal history/resources.
- At most two current encoded source Blobs and two display canvases are retained.
  There is no unbounded bitmap/filter cache. A single serial thumbnail job produces
  64px data previews; unused full-resolution originals are not decoded as DOM thumbnails.
  Active image jobs and thumbnail fetches/workers are aborted/terminated on close.
- Encoded files are limited to 30 MiB; raster header dimensions are validated before
  decode (≤100 million source pixels, ≤65535 per axis). JPEG/PNG/WebP only. Decoded
  display edge is capped at 2048; browser default 1600; Android uses 1024 or 1440 according
  to native heap, and 128 for thumbnail adaptation. Worker resize happens before canvas
  readback. Decoder scratch memory is browser-owned; this is a bound on retained
  buffers, not a guarantee about every decoder's temporary allocations.
- Filters never block the main UI thread. A newer filter/image terminates the previous
  worker and cancels its fetch. Revision fencing also rejects late fetch results.
- Browser decode uses `createImageBitmap(..., {imageOrientation:'from-image'})` in a
  Worker and `OffscreenCanvas`. A browser lacking these reports a processing error;
  no separate fallback algorithm is hidden in the page. Decoded color conversion may
  differ between codecs/platforms; exact algorithm equivalence is measured on RGBA input.
- Browsers fetch only validated input URLs with omitted credentials, no redirects or
  referrer. Same-origin media works; cross-origin raster pixels require that media
  origin's CORS permission. A CORS-denied photo reports an error. There is no arbitrary
  download proxy and no bypass of private media authorization. Session-authorized media
  would require an explicit owning acquisition adapter, never a public proxy.
- Personal files stay in memory/device cache. No upload, analytics, AI call, storage of
  file content in web persistence, or Object URL is used. The Android bridge exposes
  close, bounded JSON state, forget-personal and camera/gallery choices, never arbitrary
  URLs/files/account actions. All unrecognized WebView requests/navigation are denied;
  file/content access, storage, mixed content and popups are disabled. Packaged CSP
  limits script/worker/connect to the intercepted origin. No remote page is loaded.
- Controls are ≥44px, keyboard focus is visible, sliders and canvas regions are named,
  Esc/native back close the host, and reduced motion disables animation. Narrow split
  comparisons stack two full-width panes rather than squeeze the images horizontally.
  TalkBack semantics need human usability evaluation beyond automated DOM/target checks.

Primary API references consulted for this decision:
[Android local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content),
[HTML ImageBitmap specification](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html).
The native adapter follows the HTTPS interception model with an exact seven-file asset
allowlist and fixed media indexes; it never falls back to internet for unknown requests.

## Narrow verification

- `npm run verify:check -- image-inspector-core`
- `npm run verify:check -- image-inspector-browser`
- `npm run verify:check -- image-inspector-distribution` (sibling Teknikel checkout + built APK)
- `npm run verify:check -- image-inspector-device-build`
- `npm run verify:check -- image-inspector-device` (one connected authorized test device)
- Targeted Teknikel canonical theme/commerce cases, listed in the acceptance record.

The debug-only, non-exported `InspectorHarnessActivity` is excluded from release. Device
instrumentation operates on isolated fixture photos and does not read/write dealer
accounts, catalog DB, carts or orders. It installs the development APK without wiping app
data. Its offline source is preseeded into the existing image cache; an unreachable fixture
host ensures the successful opening actually comes from disk.

Observed local acceptance and device/browser limits: [acceptance record](../../docs/dev/IMAGE_INSPECTOR_V2_ACCEPTANCE.md).
