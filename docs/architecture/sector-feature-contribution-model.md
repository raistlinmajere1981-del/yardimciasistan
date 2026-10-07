# Sector / Feature Contribution Model — Stage 9

Status: closed and verified on `refactor/feature-contribution-model-v2`.

Stage 9 evaluated the extension points proposed by the Application Platform v2 roadmap after the Pension and Restaurant pilots had already established the page/workspace grammar. The result is deliberately smaller than a plugin framework: Yardımcı Asistan now has static typed seams for the areas that had real evidence, while domain execution and special lifetime owners remain explicit.

## Decision summary

Stage 9 uses **separate typed registries/composition seams**, not one universal registry.

Implemented:

- navigation contributions
- capability conditions for static UI composition
- narrow staged Settings contributions
- feature-owned Room/Table workspace definitions with one static aggregate

Deliberately deferred:

- Dashboard contribution registry
- executable/domain-operation registry
- runtime feature discovery
- dynamic module loading
- dependency injection/service locator
- generic controller factory
- global command/event bus
- public plugin API/versioning
- registry persistence or IPC

This follows the constitution rule: extract after evidence, not before it.

## Capability authority

`BUSINESS_PROFILES` remains the sector-to-capability preset catalogue.

A profile is not the runtime authorization source. Contribution visibility uses the persisted `BusinessCapabilitySnapshot.enabledCapabilities`, and backend/domain guards remain authoritative for execution.

The contribution condition grammar is intentionally shallow:

```ts
type CapabilityCondition =
  | { allOf: NonEmpty<BusinessCapability> }
  | { anyOf: NonEmpty<BusinessCapability | { allOf: NonEmpty<BusinessCapability> }> };
```

Properties:

- omitted condition means unconditional
- missing snapshot means no enabled capabilities
- `allOf` and `anyOf` are non-empty
- `anyOf` may contain capability leaves or one `allOf` group
- recursive condition trees are not supported
- no profile fallback
- no dependency expansion
- no hidden normalization/cache/persistence layer

The grammar is enough for current cases such as Messages:

```text
AI OR (Customers AND WhatsApp)
```

without becoming a general policy language.

## Navigation contribution

`app/navigation.ts` keeps `DesktopPage` explicit.

A `NavigationContribution` owns static UI metadata:

- page id
- icon
- order
- optional capability condition
- page presentation copy
- shell content-scroll mode

Pension and Restaurant export feature-owned navigation contributions. Other existing pages remain in the static aggregate until another extraction has real value.

`buildNavigationFromContributions()` filters against the persisted runtime capability snapshot and resolves the ordered navigation list. `getPageMeta()` and `getPageContentScroll()` consume the same metadata, removing duplicate central tables/scroll switches.

Special lifetime/header behavior remains explicit. Messages, Settings and Menu are not forced into a generic renderer simply because navigation metadata is declarative.

## Settings contribution

Settings keeps the Stage 7 ownership model.

A staged contribution receives only:

- the category-owned draft
- busy state
- configuration capabilities
- a category-restricted `onChange`

Field ownership is derived from the existing `settingsFieldOwners`; Stage 9 does not create a second Settings ownership map.

The first production contribution is the existing Layout section. It still shares the same Settings page lifetime, staged category save/discard behavior and existing setup serialization path.

Resource/action sections remain explicit when they own independent lifetimes or commands, including Room Management, Public Profile, devices, updates, password and maintenance.

The optional `condition` on section metadata is evaluated against the persisted runtime capability snapshot. Existing setup-derived `visible` predicates remain available for configuration-preview semantics. These two meanings are intentionally not collapsed.

## Entity workspace contribution

Room and Table definitions moved to their owning feature modules:

```text
components/pension/room-workspace-definition.tsx
components/restaurant/table-workspace-definition.tsx
```

`app/workspace-definitions.tsx` remains a static aggregate.

This changes definition ownership, not runtime ownership:

- Room Workspace remains hosted at the Frame/global entity-workspace lifetime
- Table Workspace remains hosted by Restaurant where its order/context lifetime already belongs
- host context remains explicit
- no resolver or service container was added
- Customer and Product definitions remain central until evidence justifies moving them; Menu contributes channel fields to Product (D-011)

The canonical entity workspace is still reused from multiple entry points; contributions do not create feature-specific editors.

## What Stage 9 did not generalize

The roadmap listed Dashboard and domain operations as concepts to evaluate, not mandatory registries.

They remain explicit because their current behavior is not uniform enough to justify a shared registration contract:

- Dashboard is a projection/launcher with SystemHealth and sync ownership constraints
- Calendar is also a projection/launcher with router-lifetime context
- Messages owns a persistent WhatsApp guest/webview lifecycle
- Market Quick Sale owns a persistent sale session and scanner/recovery sequencing
- Finance owns transaction/lock/generation rules
- Room and Table operations have different subflow and async ownership semantics

An executable operation registry would risk becoming a second application service layer or global command bus. Stage 9 therefore leaves operation controllers and domain services where they already have clear owners.

## Exit-criterion proof

The Stage 9 fixture lives under the desktop workspace and composes a test feature without copying another feature page.

It proves, in one browser harness:

1. a capability-gated navigation contribution renders through `buildNavigationFromContributions()`
2. a staged Operations Settings contribution renders through `StagedSettingsContributionSlot`
3. editing that Settings contribution updates only its category-owned draft
4. the same test feature opens the canonical `roomWorkspaceDefinition`
5. Room Workspace opens with its production presentation/tabs and restores focus to the launcher on close

Compile-time negative tests also prove:

- Operations contributions cannot write Business-owned Settings fields
- empty capability groups are rejected
- recursive `anyOf` conditions are rejected

The fixture source is also guarded against copying `PensionPage`, `SettingsWorkspace`, `LayoutSettingsSection` or `RoomsWorkspace`.

## Regression adjustment discovered during verification

The Pension workspace smoke still expected an older pre-Stage-8A customer-list assignment UI.

The production Room contribution was not at fault. The fixture was updated to exercise the current canonical path:

```text
Customers list
  → Customer Workspace
  → Odaya Ata
  → canonical Room Workspace
```

This keeps the regression test aligned with the one-entity/one-workspace rule instead of restoring a duplicate customer/room editor.

## Verification

Stage 9 closure passed locally, including the final combined fixture:

```text
npm run verify:check -- sector-feature-contributions
npm run verify:domain -- desktop
npm run verify:domain -- hospitality
npm run verify:pre-main
```

After the browser-level exit fixture was added, the `sector-feature-contributions` leaf check and Pre-main Verify were rerun during fixture hardening; the final reported runs were clean.

## Stage 10 handoff

Stage 10 may now remove legacy compatibility/presentation debt and reset documentation around the v2 architecture.

It must not use cleanup as a reason to introduce the deferred Stage 9 abstractions. In particular, keep Dashboard/operation execution explicit unless new evidence establishes a real reusable contract.
