# Business AI authority and intent

Status: current source contract (single working copy; no compatibility fallback).

## Authority

`BusinessAiContext.capabilityIds` is required functional business truth. It is built by
`createCurrentBusinessAiContext()` from `DesktopDatabase.getEnabledBusinessCapabilities()`;
`createBusinessAiContext()` never derives it from a profile or public description.
The desktop publication passes it as `capability_ids` through sync-core's
`pushBusinessContext()` and the authenticated `publish_business_context` endpoint.

The current repository does **not** define `BusinessAiFacts`, `tenantVerticals`,
`offeredServices`, `verifiedDomains`, `hasBusinessAiCapability()` or
`includesBusinessAiCapabilityText()`. These are not alternative authority sources.
Foreign metadata and descriptive/public text must not grant capabilities.

`canBusinessSpeakForAiDomain(capabilities, domain)` answers only whether the business
may discuss that domain **as its own service**. Unknown domains return false, even
with every registered capability. Domain support does not prove an individual
product/amenity, available resource, price, reservation approval or executable operation.
Operation-specific capability/session gates remain separate.

## Recognition is not authorization

`detectBusinessAiDomainMentions(requestType, text)` detects intent only.
`evaluateBusinessAiInput()` returns a discriminated decision:

- `supported`: recognized domains are backed by capabilities;
- `unsupported`: at least one recognized domain lacks capabilities;
- `information`: general factual/neutral promotional context, **not domain permission**;
- `unrecognized`: no recognized intent; **not domain permission**.

Owner/web use deterministic local responses for unsupported/unrecognized requests.
Trusted catalog matches may identify the topic for terse product-name questions;
they still pass the same capability check and never authorize a disabled catalog/menu.
Marketing text and images reject those inputs before calling a provider. Instructions
and style hints are inputs, not authority. Information and supported requests sent to
providers receive an explicit capability-derived domain allowlist, with descriptions,
knowledge files, history and instructions explicitly subordinate to it.

The former `getUnsupportedBusinessAiDomain()` returned null both for supported and
unrecognized input. It and PHP's profile-based empty-capability compatibility fallback
are removed; no deprecated adapter remains.

## Mapping and exceptions

`packages/shared/types/business-ai-policy.ts` owns mappings using typed references to
`BUSINESS_CAPABILITIES`, and portable recognition patterns. PHP evaluates a checked
JSON snapshot, not another hand-written capability/regex mapping. Refresh intentionally
after building shared with `npm run sync:business-ai-policy`; normal builds/tests never
rewrite it. `business-ai-boundary` verifies snapshot equality and TS/PHP decision parity.

- Accommodation: rooms.
- Food service: tables, menu or orders (domain discussion, not reservation authorization).
- Tables: tables specifically; a menu alone cannot offer a table service/reservation conversation.
- Menu: menu, not rooms or generic food-service inference.
- Commerce: catalog; particular product claims still require current catalog evidence.
- Breakfast: rooms **or** food service, preserving the existing accommodation-amenity
  exception. Rooms do not grant restaurant/table service. Hours/features still need data.
- Appointment: recognized but unsupported; there is no appointment capability in the
  registry. Calendar/tasks are not a substitute. No new business operation is introduced.

## Surface audit

| Surface | Authority and lifecycle |
| --- | --- |
| Owner reply/rewrite | Desktop persisted capabilities → shared decision → deterministic save or ai-core; ai-core also guards direct callers. Request type, message and rewrite instructions cannot grant support. |
| Web chat (PHP) | Published `capability_ids` → checked policy evaluator → deterministic reply or explicit allowlist prompt. Impossible domain requests remain general requests with original customer text preserved. No profile fallback. |
| ai-core web chat | Typed capability context → same policy and prompt. Missing authority means an empty capability set, not profile/knowledge inference. |
| Marketing text/rewrite/adaptation | Existing marketing/AI operation gates plus persisted capabilities → shared policy over text/instructions/style → authority prompt. No customer enrichment or automatic publication. |
| Marketing image generation | Same input authority and pre-provider rejection; capability allowlist included in image prompt. Image generation support in an AI model is not a business-service capability. |
| Daily evaluation | Existing dashboard projection filters operations with persisted capabilities; current context plus shared authority prompt. Customer requests are observations, not offered services. |
| Desktop report AI | Reports/AI operation gates; sales requires food orders. `database/report-store.ts` builds capability-projected data; `report-ai.ts` summarizes calculated JSON, with numeric output validation. No open-ended service offering input, so no intent gate. |
| Android report AI | Device/admin + Android/AI/reports gates, published capability-projected report snapshot, fixed modes and numeric output validation. No customer-chat scope on the device-token endpoint. |
| Finance AI | Finance/AI operation gates; summaries of a computed ledger payload, not a business-service offering surface. No intent-derived support. |
| Stock image analysis | Desktop IPC and PHP endpoint require AI/menu/inventory (Android additionally requires Android/device permission). Analysis is restricted to candidate item IDs and sanitized before a human-reviewed apply operation. Image text never grants a business capability. |
| Identity image analysis | Customers/AI operation gates (Android additionally Android/admin), document-field extraction and sanitization only. Not an accommodation/appointment service assertion. |
| AI connection/vision/model checks | Provider diagnostics, no customer business-service claims and no capability derivation. |

## Limits, not security guarantees

Regex recognition is deliberately not an exhaustive domain taxonomy. General context
or recognized requests may contain additional topics the recognizer does not identify;
they do not gain domain permission, but the provider must obey the explicit allowlist.
This is a prompt boundary for generated prose/images, not a proof of semantic compliance
by an arbitrary model. No exhaustive unknown-domain output validator exists. Generated
images are not semantically inspected. Human review before sending/publishing remains
necessary. Tests prove the deterministic negative gates, mapping contract and authority
passed to providers, not universal absence of hallucinations/prompt injection.

Conservative `unrecognized` responses can ask for clarification on a legitimate new
service or a terse follow-up. Add a registry-backed domain mapping and intent tests to
support new service domains; do not grant them from labels/descriptions or a regex match.

## Changed files

```text
apps/desktop-app/electron/business-ai-service.ts
apps/desktop-app/electron/marketing/ai-service.ts
docs/architecture/BUSINESS_AI_AUTHORITY.md
firm-template/web-module/api/chat.php
firm-template/web-module/lib/business-ai-policy.json
firm-template/web-module/lib/business-ai-policy.php
package.json
package-lock.json
packages/ai-core/package.json
packages/ai-core/types/index.ts
packages/ai-core/prompts/owner-reply.ts
packages/ai-core/prompts/web-chat.ts
packages/ai-core/tests/ai-core.test.cjs
packages/shared/index.ts
packages/shared/types/business-ai-context.ts
packages/shared/types/business-ai-policy.ts
packages/shared/tests/business-ai-context.test.cjs
scripts/package-web-module.mjs
scripts/php-lint.mjs
scripts/smoke-business-ai-boundary.mjs
scripts/smoke-capability-surface-consistency.mjs
scripts/smoke-marketing-studio.mjs
scripts/smoke-marketing-ui.mjs
scripts/smoke-web-module-menu.mjs
scripts/smoke-web-widget-module.mjs
scripts/sync-business-ai-policy.mjs
scripts/verification-registry.mjs
```
