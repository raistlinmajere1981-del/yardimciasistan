# Architecture audit A — publication contract

**Finding: INCOMPLETE.** The durable Desktop → Hosting publication protocol is sound in the inspected paths. Release readiness is incomplete because actual site consumers differ from the shared renderer, provider metadata has a concrete Desktop/Hosting mismatch, and the release report contains unresolved failures.

**Recommendation: fix the bounded deficits first; do not redesign publication or require a clean install. Hold release until the failed gates are resolved with captured evidence.**

This audit used local source and existing artifacts only. “Actual site” below means the root renderer selected by its local deployment script; deployed remote bytes were not inspected.

Evidence prefixes:

- `D/` = `apps/desktop-app/electron/`
- `H/` = `firm-template/web-module/`
- `C/` = `web-site-template/`
- `T/` = sibling `teknikel_web/`
- `G/` = sibling `gundogdu_web/`
- `E/` = sibling `EfektAtolyesi/`
- `R` = `artifacts/verify/2026-11-04T17-23-49-190Z.json`

## 1. Authority and feature trace

The intended ownership is coherent: Desktop owns canonical intent and publication; Hosting owns authenticated apply, public projections and mutations; websites own presentation. The backend package deliberately does not install or update the renderer.

Evidence: `docs/architecture/WEB_DATA_SERVICE_CONTRACT_V1.md:3–15`; `docs/architecture/WEB_SITE_TEMPLATE_V1.md:5–15`.

| Feature | Desktop owner | Hosting owner | Website consumer | Check result and severity |
|---|---|---|---|---|
| Runtime capability and public surfaces | Persisted capability projection, carried in `android_snapshot` | `public-request-policy.php`; publication-derived surfaces in `business.php` | Canonical publication projection; Teknikel publication model; Gündoğdu public-data model | **Matches core authority.** Missing capabilities fail closed. Profile names do not grant access. Cross-publication convergence remains eventual. **P1 operational gate.** |
| Widget AI | Private `ai_settings`, public context and AI catalog producers | `chat.php`, private configuration and runtime capability gate | Common widget; Teknikel presentation bridge; Gündoğdu widget initialization | **Partial.** `ai_enabled` reports capability, not provider readiness. Enabled UI can coexist with unavailable provider configuration. **P1.** |
| `general_info` / `price_question` | Request domain receives normal ingress | Public request policy and `request.php` | Common widget supports general information; Teknikel adds date-free general/product forms | **Matches backend policy; consumer coverage differs.** `price_question` is an API type without a common widget form. This does not require every site to expose it. **P2 maintenance.** |
| Dealer application / private commerce | Business-context application preference; private access/catalog producer | Application gate, account/session and dealer endpoints | Common application widget; Teknikel private commerce consumers | **Strong backend separation.** Application permission, dealer login and private catalog access are distinct. Gündoğdu’s limited presentation is not automatically a defect. |
| WhatsApp and maps | Public context, persisted WhatsApp capability, selected map source | `business.php`, map sanitization | Independent contact/widget actions | **Mostly matches.** WhatsApp links do not imply Business Messaging provider readiness. Bootstrap contact fallback can survive without a business publication. **P1 provenance risk.** |
| Multilanguage | Site-catalog discovery, translation store/service, `business_context.localization` | Localization allowlist and catalog/hash validation | Canonical PHP resolver; separate Teknikel/Gündoğdu browser resolvers | **Matches main contract.** Published targets authorize languages; source hashes protect UI translations. Site consumers retain identity heuristics. **P2.** |
| Catalog, stock and price | Explicit product publication and canonical pricing | Catalog projection; order-intent validation; private dealer catalog | Canonical catalog; Teknikel storefront/commerce | **Matches scoped semantics.** Published availability is not live stock quantity; guest HTTP acceptance is not final Desktop pricing/fulfilment. No catalog consumer is required on Gündoğdu. |
| Published media and effects | Product/resource/gallery upload preparation; editorial publication | Media APIs and sanitized publication references | Published-media renderers; site-owned effect adapters | **Media transport robust; effect distribution incomplete.** Common vendor integrity does not establish parity with current EfektAtolyesi source. **P1/P2.** |
| Offline, restore, credentials and ACK | Publication service, source activation, restore registry and ingress | CAS activation, fenced apply, transactional receipts/private config | Sites consume last accepted Hosting state | **Strong protocol; bounded limitation.** Offline withdrawal cannot immediately revoke Hosting state. Restore completion is explicitly distinct from local restore success. |

### Capability publication is not Android enablement

Hosting reads persisted capabilities from `android_snapshot`; absence returns an empty capability set. Requests additionally require both `customer.requests` and `core.customers`. The Desktop projection deliberately retains capabilities while Android data and credentials are disabled.

Evidence:

- `D/android-capability-projection.ts:132–140`
- `D/sync-outbox-publisher.ts:81–86`
- `H/lib/public-request-policy.php:5–26`

Rooms, restaurant, QR menu and store surfaces are reconstructed from enabled publications, rather than granted by the configured profile. Canonical pages further require actual records.

Evidence: `H/api/business.php:47–65`; `C/core/publication.php:117–135`; `C/core/pages.php:25–55`.

This is already a useful boundary: **installed capability, published channel, available content and website presentation are separate decisions.**

## 2. Findings requiring attention

### A1 — AI capability can produce a readiness false positive

`business.ai_enabled` checks only `service.ai`. Chat independently checks capability and provider configuration. Meanwhile, ordinary automatic publication deliberately leaves unconfigured AI intent pending without failing unrelated synchronization.

Evidence:

- `H/api/business.php:39–43,79–82`
- `H/api/chat.php:48–53,414–463`
- `D/ai-settings-publish-service.ts:18–42`
- `D/sync-coordinator.ts:496–521`

Consequently, these states can coexist:

- AI capability published;
- widget AI action visible;
- provider configuration unavailable or publication pending;
- an otherwise successful synchronization cycle.

That is not evidence of an authorization bypass. It is a **status-contract limitation**. Restore handles one important case correctly: an explicitly restored unconfigured provider publishes effective disablement; an unreadable existing credential blocks reconciliation instead of guessing that it should be cleared.

Evidence: `D/ai-settings-publish-service.ts:33–57`.

**Minimal correction:** retain capability semantics and add a clearly defined effective availability/publication status, derived from existing owners. Do not equate a local toggle, connection test or general sync success with exact remote publication completion.

### A2 — Concrete Cloudflare Desktop/Hosting contract mismatch

Current shared metadata returns no static Cloudflare STT options and accepts Cloudflare model identifiers through separate validation. Hosting still permits one fixed STT model.

Evidence:

- `packages/shared/utils/ai-model-capabilities.ts:14–25`
- `H/lib/audio-transcription.php:9–17`
- `H/lib/audio-transcription.php:122–127`
- `H/api/sync.php:1858–1864`

This is more than a stale UI expectation: a Desktop-selected model outside Hosting’s fixed list can be rejected during private settings publication or transcription.

The existing settings test explicitly compares PHP and shared model lists, so its parity assertion conflicts with current source. Later portions also expect the former static Cloudflare model collection.

Evidence: `scripts/smoke-voice-stt-settings.mjs:92–97,178–200`.

**Classification:** actual current producer/Hosting mismatch, plus obsolete test assumptions. The report contains no stack proving which assertion caused the historical failure.

### A3 — Bootstrap identity/contact remains consumable without publication

`business.php` falls back to deployment config for identity/contact and always exposes some config-owned fields. It correctly supplies `business_publication` provenance, but ordinary contact rendering does not require that provenance.

Evidence:

- `H/api/business.php:28–38,69–87,109`
- `H/api/business.php:141–158`
- `C/core/publication.php:154–159`
- `T/assets/publication-model.js:43–67`
- `G/assets/js/public-data.js:52–77`

Therefore “no Desktop business publication” does not necessarily mean “no displayed identity/contact.” An old deployment configuration can remain visible while capabilities and requests correctly fail closed.

**Minimal correction:** explicitly distinguish permitted site/bootstrap branding from Desktop-published contact fields. Consume existing provenance where publication is required; do not invent a second business database.

### A4 — Source activation fences writes but does not atomically replace every projection

Hosting activation changes the active source. Publication reads still retrieve the latest row by publication name without filtering it to the newly active epoch. Different publication kinds apply separately.

Evidence: `H/lib/storage.php:637–665,689–705,812–830`.

Thus a partial reconnect/restore can temporarily serve a mixture of older and newer publications, including retained private configuration. This follows the existing convergence model; it is not proof of erroneous ACK handling.

**Release implication:** an authenticated connection or one successful apply is insufficient evidence of complete independence. Require all intended publication kinds—including OFF/empty bodies and private settings—to converge.

### A5 — Effect distribution has a real provenance gap

Read-only byte comparison found:

- Both sites’ `canonical/` core and core-asset copies matched the current common template: **51 compared files each**.
- All three inspected template manifests reported **0.6.1**, with their **70 recorded common-file hashes matching**.
- The common effect provenance lists **13 modules**.
- Compared with the current **19-module** EfektAtolyesi runtime/model/registry tree, the template has **four changed files and six absent files**.
- Gündoğdu’s active effect-engine copy matched those 19 upstream modules.

Both runtime entrypoints still declare `1.1.0`, although their exports differ.

Evidence: `C/public/assets/vendor/effect-engine/src/runtime/index.mjs:1–4`; `E/src/runtime/index.mjs:1–6`.

The common test validates vendor files against the bundled provenance, not against the current upstream checkout.

Evidence: `scripts/smoke-web-site-template.mjs:81–85`; `C/tools/sync-effect-engine.mjs:8–29`.

This does **not** prove existing photo effects are broken. It does mean version equality and a passing bundled-integrity test cannot establish current upstream parity or compatibility with newly authored scenes.

**Minimal correction:** identify and pin the intended engine revision/content hashes; align only the required distribution and verify representative scene compatibility.

## 3. Actual renderer comparison and manual patches

### Teknikel

The deployment script selects root `assets/`, `inc/` and page directories. Its `canonical/` directory is not the active renderer package.

Evidence: `T/scripts/deploy-site.sh:18–27`.

The active site builds one public snapshot, keeps private dealer catalogs outside it, clears visible publication state when refreshing, and applies capability/publication/content gates.

Evidence: `T/assets/storefront.js:8–16,121–146`; `T/assets/publication-model.js:43–81`.

Its widget bundle differs from the common bundle. The documented `setPublication`/`openRequest` bridge lets site presentation use that snapshot. Date-free general/product forms remain site-owned and submit the official request schema with stable retry keys.

Evidence:

- `T/README.md:24`
- `T/inc/layout.php:71`
- `T/assets/assistant/presentation.js:4–35`
- `T/assets/assistant/customer-request.js:21–54,105–134`

**Why patches occurred:** the site needed one publication-controlled presentation state and product-specific request UX beyond the common widget’s supported form subset. The common widget type list includes general information and dealer applications but omits `price_question`.

Evidence: `test-site/landing/assistant/widget-config.ts:4,105–124`.

Those requirements are legitimate. The maintenance deficit is that replacing the widget bundle can discard the bridge. Today’s common general-information form support also means historical statements about reservation-only handling should not be treated as current universal behavior.

### Gündoğdu

Its deployment script also selects the root custom site, not `canonical/`.

Evidence: `G/scripts/deploy-site.sh:18–24`.

The root renderer intentionally avoids SSR calls into its own PHP pool. Browser reads own published data; the README records the earlier same-worker timeout problem.

Evidence: `G/inc/data.php:34–51`; `G/README.md:28–30,52`.

The active widget bundle is byte-identical to the common widget, but site JavaScript separately filters requests, initializes widget config and polls public data every 15 seconds when no widget panel/dialog is open.

Evidence: `G/assets/js/site.js:45–64,94–117`.

The widget also performs its independent business GET and can replace supplied configuration.

Evidence: `test-site/landing/assistant/index.ts:1482–1502`.

**Risk:** two reads can represent different publication moments. Site capture guards reduce the request risk, but this remains a duplicated presentation-state path. An open panel also suppresses the site polling path.

Gündoğdu intentionally exposes only selected request types. Absence of dealer, catalog or `price_question` presentation is **not itself a contract failure**.

Its static branding and regional imagery are site-owned editorial content. They should not be classified as unauthorized Desktop business publications. However, this custom renderer differs from the common template’s publication-based page availability and server-side 404 behavior.

Evidence: `G/index.php:18–30`; `C/core/bootstrap.php:29–41`.

Gündoğdu’s effect adapter eagerly imports the engine and uses a fixed hero-scene path. The common adapter imports only after valid binding, motion permission and active scene checks.

Evidence: `G/assets/js/hero-effects.mjs:1–8,21–37`; `C/public/assets/core/effects.mjs:33–67`.

**Conclusion:** manual patches reflect custom renderer choices and integration needs. Updating inactive `canonical/` copies cannot update those root integrations.

## 4. What is already robust

- **Durable publication completion:** Desktop prepares persistent bodies and completes only the acknowledged revision; sync-core validates the exact wire identity/hash.
  Evidence: `D/desktop-publication-service.ts:18–41`; `packages/sync-core/hosting-transport.ts:617–650`.

- **Transactional Hosting apply:** source fencing precedes historic receipt replay; conflicting identities/bodies are rejected; domain apply and publication metadata share the transaction.
  Evidence: `H/lib/storage.php:689–747,783–805`.

- **Secret boundary:** sensitive frozen payloads use safeStorage; Hosting applied private settings override host-local defaults.
  Evidence: `D/publication-payload-codec.ts:3–15`; `H/config/ai.php:23–46`.

- **Restore durability:** runtime publication state is replaced atomically in the staged database, all 12 registry kinds are queued, and completion requires publication coverage plus inbound replay.
  Evidence: `D/desktop-publication-registry.ts:5–17`; `D/database/restore-reconciliation-store.ts:59–73,101–105`.

- **Import before ACK:** inbound order/request handling advances durable local progress before remote acknowledgement.
  Evidence: `D/web-sync-ingress.ts:48–88,130–167`.

- **Language ownership:** Desktop discovers the neighboring site’s public source catalog without credentials; ready translations require current source hashes, and manual translations are protected during AI work.
  Evidence: `D/public-site-catalog.ts:19–35`; `D/database/public-translation-store.ts:177–191`; `D/public-translation-service.ts:92–114`.

- **Translation fallback:** canonical UI checks catalog identity/hash/placeholders; both custom sites authorize languages from published target metadata.
  Evidence: `C/core/i18n.php:27–53`; `T/assets/language.js:18–61`; `G/assets/js/language.js:56–70,185–205`.

- **Price/private authority:** clients submit product identities and quantities; Desktop resolves canonical prices. Dealer identity and price group are not client authority.
  Evidence: `H/lib/online-order.php:50–66,121–141`; `H/lib/dealer-order.php:20–60`; `D/commerce-order-store.ts:340–357`.

The catalog producer publishes explicit active products and `availability: "available"`, without live stock quantity. Guest HTTP submission accepts an order **request**, with canonical Desktop pricing occurring during import. These semantics must remain clear in website copy.

Evidence: `D/commerce-online-catalog-publication.ts:24–42`; `D/online-order-ingress-service.ts:65–78`.

## 5. Release report: 292 pass, 11 fail

The requested artifact confirms **292 passed, 11 failed, no skipped checks**. Every failed entry has exit code 1 and an empty `error`.

The runner inherits stdout/stderr and records only process-spawn errors in JSON. Assertion stacks therefore are not preserved in this artifact.

Evidence: `R:1–18`; `scripts/verify.mjs:125–145`.

| Failure cluster | Checks | Supported classification |
|---|---|---|
| Registry coverage | `verification-registry-tests` | **Current registry drift demonstrated:** five smoke files have no registry reference: AI cancellation pair, ZIP-import pair and Teknikel shipping-repair UI. The coverage assertion requires all smoke files registered or explicitly ignored. Exact historical failing assertion remains unknown. Evidence: `scripts/test-verification-registry.mjs:60–72`; `R:44–50`. |
| Settings/browser integration | `business-messaging-ui`, `desktop-renderer`, `desktop-tts-ui`, `instagram-oauth-settings-ui`, `settings-platform` | **Plausibly shared, not proven one cause.** Several share settings fixtures/helpers. Messaging and Instagram tests still search for child buttons inside service rows, while production rows are themselves buttons. This demonstrates some current selector drift; it does not explain all five failures. Evidence: `scripts/smoke-business-messaging-ui.mjs:40–48`; `scripts/smoke-instagram-oauth-settings-ui.mjs:27–36`; `ServiceSettingsCard.tsx:103–112`; `R:508–514,1068–1074,1092–1098,1284–1290,2004–2010`. |
| Runtime lock contract | `runtime-boundary-lock` | **Current test drift demonstrated; security result unresolved.** Test assumes a fixed handler count and invokes AI testing without the newly required test ID. Actual handlers retain unlock checks. Do not infer a lock bypass or waive the gate. Evidence: `scripts/smoke-runtime-boundary-lock.mjs:171,234–258`; `D/ipc/ai-connection-ipc.ts:18–40`; `R:1932–1938`. |
| STT | `voice-stt-desktop`, `voice-stt-settings` | **Mixed/unknown.** Settings contains obsolete Cloudflare assumptions and exposes the actual PHP/shared mismatch described above. Desktop STT’s exact failure is unknown without its stack. Evidence: `scripts/smoke-voice-stt-settings.mjs:92–97,178–200`; `R:2148–2154,2188–2194`. |
| Static lint | `lint-strict` | **Unknown.** No diagnostic text supports a specific root cause. `R:2356–2362`. |
| Architecture policy | `architecture-audit` | **Current source-policy violation demonstrated:** `ModalSurface` observes sidebar subtree changes and non-data attributes, outside the audit’s sole observer exception. Historical stack/count unavailable. Evidence: `ModalSurface.tsx:98–104`; `scripts/architecture-audit.mjs:85–113,276–284`; `R:2380–2386`. |

**The 11 failures cannot defensibly be labelled “all test drift.”** There is demonstrated drift, an actual provider-contract mismatch, a current architecture-policy violation, and unresolved failures.

**Both `architecture-audit` and `runtime-boundary-lock` are release blockers.** Architecture audit is an inherited pre-main gate; runtime lock is a full-preset smoke inherited by release. Updating test registration/counts must preserve the complete locked invocation sweep.

Evidence: `scripts/verification-registry.mjs:431–433,461–477,523`; `scripts/test-verification-registry.mjs:26–40`.

Positive existing evidence includes passing `publication-protocol`, `sync-publication-correctness`, `automatic-sync`, translation checks, `web-site-template`, `voice-stt-publication` and `windows-demo-restore`.

Evidence: `R:428–434,1828–1858,2084–2090,2180–2186,2276–2282,2332–2338`.

Those results cover their local fixtures, not the deployed custom sites or later dirty-worktree changes.

## 6. Refresh, clean install and retained state

**A clean install is not required to establish independence.** The existing protocol already supplies target binding, explicit source takeover, epoch fencing, exact retry and registry-wide restore reconciliation.

A browser refresh only rereads deployed code/data. A site-only update is needed when root renderer code must change. An API-only update cannot deliver those renderer changes.

| State | Appropriate treatment |
|---|---|
| Old outbox jobs, frozen bodies, revisions, saved source epochs and consumption cursors during explicit restore | Let the existing staged restore owner replace them atomically. Do not manually delete fragments. |
| Business records, capability selections, publication preferences, manual translations and media originals | Preserve for same-business continuity; regenerate through current producers. |
| Old/unreadable provider credentials | Re-enter or explicitly clear through their owner. Unreadability must not silently become a disable/clear decision. |
| Host bootstrap identity/contact, default AI configuration, account callback/site settings | Verify installation ownership. Explicitly replace stale installation configuration when establishing a different firm/target. |
| Hosting source/receipt history and request/order replay facts | Preserve when validating reconnect/restore continuity; fencing relies on durable history. |
| Web accounts/sessions and acknowledged submissions | Normal restore does not rewind them. Deliberate staging reseeding is a separate operation. |
| Site branding, assets, editorial content and source catalog | Keep installation-owned; merge common updates through the existing update plan. |
| Browser state | Retire known obsolete language cookies/dictionaries narrowly. Do not use global browser clearing as a publication fix. |

Evidence: `docs/architecture/DESKTOP_RESTORE_RECONCILIATION_V1.md:9–18,24–76`; `D/publication-source-service.ts:11–33,43–70`; `C/tools/update-plan.mjs:5–25`.

All project Alwaysdata environments are disposable staging. That permits intentional resets when needed, but a reset is not evidence of reconnect/restore correctness and is unnecessary for these bounded fixes.

Evidence: `docs/dev/TEST_ENVIRONMENT_POLICY.md:9–21`.

## 7. Prioritized fixes and acceptance gates

### P0 — Resolve release blockers with observable failures

1. **Capture diagnostics for the 11 failed checks**, initially through narrow runs by the implementation owner. Preserve existing test behavior; avoid another blind full run.
2. **Repair runtime-lock test drift** for current handler registration and AI test identity, retaining all protected-channel assertions.
3. **Resolve the ModalSurface architecture violation** through the established appearance/lifecycle owner, or an explicit architectural decision—not a broad audit exemption.
4. Resolve remaining lint/runtime failures from their actual diagnostics.

**Acceptance:** each failed check has a captured diagnostic and then a targeted passing result; the lock sweep still rejects protected operations before reads/network/domain work.

### P1 — Close publication-contract deficits

1. **Align Cloudflare STT publication and execution validation** between Desktop/shared metadata and Hosting.
   **Acceptance:** a permitted selected model publishes and executes consistently; invalid selection fails safely; PHP/shared parity assertions reflect the intended contract.

2. **Separate AI capability from effective remote readiness.**
   **Acceptance:** missing configuration, unreadable restored key, pending publication and provider error cannot appear as verified remote readiness; unrelated sync remains usable.

3. **Define bootstrap/publication provenance for contact fields.**
   **Acceptance:** an empty Hosting publication database with deliberately stale bootstrap contact cannot impersonate a newly connected firm; intentional site-owned branding remains valid.

4. **Require complete convergence before declaring target independence.**
   **Acceptance:** partial/offline activation remains visibly pending; all 12 kinds reach their intended exact ACK state; OFF/empty/private settings withdraw correctly; old-source sends remain fenced.

5. **Pin the intended effect-engine distribution.**
   **Acceptance:** recorded upstream revision/hashes explain every distributed module; representative scenes work or preserve static fallback.

### P2 — Reduce consumer maintenance drift

1. Formalize Teknikel’s snapshot/widget bridge as a supported adapter boundary.
2. Give Gündoğdu a consistent publication-state handoff for widget presentation.
3. Replace custom-site business-translation ID heuristics with `localization.business_id`.
4. Document each site’s intentional feature subset and editorial/page behavior.
5. Correct documentation drift, including the source-catalog limit: current code accepts 2048 entries while the template README still says 1000.

Evidence for the last point: `D/public-site-catalog.ts:9`; `C/core/i18n.php:18`; `C/README.md:121–124`.

**Acceptance:** publication withdrawal, API failure, delayed responses and language removal remove affected options without restoring stale state. An update of shared widget assets preserves each site’s supported integration.

## 8. Concrete release checklist

- [ ] Resolve all 11 failed checks with retained diagnostics and targeted results.
- [ ] `architecture-audit` and the complete `runtime-boundary-lock` pass.
- [ ] Verify capability ON/OFF independently from published data and provider readiness.
- [ ] Verify date-free general/product requests, stable retry keys, changed-intent conflict and server-side withdrawal rejection.
- [ ] Verify dealer application permission separately from account login/private catalog access.
- [ ] Verify WhatsApp and directions with AI disabled.
- [ ] Verify target-language addition/removal, source-hash changes, manual translation priority and Turkish fallback.
- [ ] Verify public/private catalog separation, server-owned prices and request-versus-final-order wording.
- [ ] Verify media preparation failure, withdrawal and static effect fallback against the pinned engine.
- [ ] Verify offline/partial restore, lost ACK retry, old-source fencing and full reconciliation completion.
- [ ] Test the **root Teknikel and Gündoğdu renderers**, not only their matching `canonical/` copies.
- [ ] After fixes stabilize, the owner runs `npm run verify:release`; this remains necessary because targeted passes do not replace the failed release result.
- [ ] Any subsequent site/API deployment receives its existing target preflight and post-deployment checks.

**Milestone decision:** retain the publication architecture and fix these small, owned deficits first. The evidence does not justify replacing the outbox, activation, ACK or restore mechanisms.

## Audit scope and confidence

**No changes, database writes, installations, cleanup, tests, packaging or deployment were performed.** No credentials are included here.

The audited worktree remained on `main`, HEAD `67b2bb3b76a39290c3363945e4be88152d054a24`, with existing modifications and untracked files. `git diff --check` passed.

Confidence is **high** for the cited local code paths, artifact statuses and byte comparisons; **limited** for historical failure root causes, current deployed bytes and real provider behavior. The release artifact has no captured assertion stacks or source revision binding, so those uncertainties remain explicit.