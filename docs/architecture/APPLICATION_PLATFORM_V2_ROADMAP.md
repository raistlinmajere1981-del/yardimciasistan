# Yardımcı Asistan — Application Platform v2 Roadmap

Purpose: evolve Yardımcı Asistan from a growing collection of working feature pages into a platform that can absorb new sectors, settings and operations without multiplying UI/state/interaction debt.

This roadmap should be executed in stages. Do not launch a repo-wide rewrite.

---

## Program principles

- Keep the application usable after each stage.
- Prefer vertical pilots over speculative generic abstractions.
- Preserve business behavior until a named domain decision changes it.
- Replace old UI contracts instead of preserving duplicate surfaces.
- Do not let presentation tests freeze the old architecture.
- Keep Git history focused: one concern per commit group.
- Use diagnostics during each pilot rather than adding ad-hoc console logging.
- Do not trigger GitHub Actions for routine local verification while CI quota is constrained.

---

# Stage 0 — Constitution and decision baseline

## Deliverables

- `APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md`
- `DOMAIN_DECISIONS_V1.md`
- this roadmap
- agent instructions reference the new documents
- older UI migration docs are explicitly historical when they conflict with the constitution

## Exit criteria

A coding agent can determine page vs entity vs operation ownership, allowed surface type, state lifetime owner, Settings contribution model, Appearance model and test layer to update.

No runtime change required.

---

# Stage 1 — Appearance & Design Foundation v2

Goal: remove the two-theme/easy-pro concept before new workspaces spread it further.

## Scope

Introduce one appearance model:

```text
scheme: system | light | dark
density: comfortable | compact
scale
accent preset
font preset
reduced motion
```

Map legacy stored preferences once:

```text
easy → comfortable
pro → compact
light/dark → matching scheme
existing scale → matching scale
```

## Technical work

- replace `UiMode easy/pro` with density
- add `system` scheme support
- centralize controlled accent tokens
- provide system/Plex font presets only initially
- preserve semantic-token API
- introduce component-token layer only where repeated workspace primitives need it
- remove feature branching on old `data-mode`
- update Settings appearance UI only enough to expose the new model; full Settings v2 comes later
- keep old page anatomy intact during this stage

## Do not do

- redesign every feature page
- create arbitrary color picker
- support custom font files
- retheme menu preview/customer-facing renderer without a separate reason

## Exit criteria

- one appearance engine
- old easy/pro concept removed from runtime
- light/dark/system + density + scale tested
- no new feature CSS theme branches

Recommended reasoning: **normal/medium coding model** is enough after the contract is fixed.

---

# Stage 2 — Workspace Platform Foundation

Goal: create only the shared primitives required by the Pension pilot.

## Deliverables

Likely:

- `WorkspaceFrame`
- `WorkspaceTabs`
- `IconButton`
- `FormDialog`
- in-workspace confirmation treatment (the standalone `ConfirmDialog` primitive was later removed as unused; confirmations stay inline)
- workspace presentation: centered / full-canvas
- focus restoration and busy-close rules
- viewport workspace layout contract
- initial workspace navigation intent/host

## Navigation

Add an explicit entity/action intent layer alongside page navigation.

Do not build a generic command bus.

The host should support entity type/id, initial mode/subflow, return context and preserving workspace state while centered ↔ full-canvas presentation changes.

## Exit criteria

A fixture workspace can open from two entry points, switch tabs, enter/exit a subflow, expand to full-canvas without losing draft, close and restore focus/context, and use only one modal layer.

Recommended reasoning: **GPT-6 Astra High** for initial architecture/implementation review; mechanical polish can use normal coding models.

---

# Stage 3 — Pension Domain Boundary Hardening

Goal: remove known semantic ambiguity before the new UI makes it look unified.

This is a domain stage, not visual work.

## Required decisions/work

### Reservation ↔ Stay

Add an explicit path for creating a Stay from a Reservation while preserving `reservation_id`.

Keep `assignReservationRoom` separate from `createStay`.

### Checkout

Implement one intentional hospitality checkout coordinator according to accepted D-004/D-005:

- Stay departure
- Folio condition
- room → cleaning
- financial close behavior
- explicit errors/next action

Per accepted D-005, checkout proceeds with an outstanding balance and the Folio stays open for later settlement. Do not create a second receivables ledger in this stage.

Do not mark a room available merely because financial close occurred.

### Room status projection

Make the UI/domain API capable of presenting operational condition, occupancy and planned reservation without pretending the current single `RoomStatus` field is the complete truth.

Schema split may be deferred if a safe projection can provide this first.

### Do not expand scope into

- unlimited history
- new receivables system
- global Stay editor unless required by the pilot
- migration rewrite unrelated to the decisions above

## Exit criteria

Behavior tests clearly prove the intended Reservation/Stay/checkout boundaries.

Recommended reasoning: **GPT-6 Astra High**, because behavior spans multiple services and side effects.

---

# Stage 4 — Pension Pilot

Goal: prove the application grammar on the most cross-cutting existing feature.

## Page anatomy

```text
Pansiyon
  local toolbar
  [Odalar] [Rezervasyonlar] [Günlük İşler]
  one active viewport workspace body
```

Remove the current vertical composition of unrelated large operation panels.

## Rooms mode

Compact room grid/list.

Click room → `RoomWorkspace`.

Room tile contains only room identity, meaningful state summary, current guest/stay summary if relevant, one critical indicator such as balance/cleaning, and a minimal contextual shortcut only when frequency justifies it.

## Room Workspace

Tabs:

```text
Özet | Konaklama | Hesap | Geçmiş
```

Subflows inside same workspace:

- reservation-room assignment
- Stay creation
- check-in
- room operational status
- add menu item / charge
- payment
- checkout

No nested modal.

Full-canvas expansion uses the same entity state.

## Reuse

Preserve useful logic from Reservation list/filter, Daily Task list/filter, Room assignment field model, Folio calculations/actions, customer model/formatters, capability/session gates and existing IPC/services.

## Remove after canonical replacement

- global Pension Folio overview surface
- top-level Stay archive accordion
- RoomAssignment drawer shell
- Folio wide drawer shell
- nested Folio confirmation modal
- duplicate room default-price edit ownership

## Exit criteria

- Pension page itself does not grow vertically with all operation areas
- active workspace body owns scroll
- same Room Workspace opens from Room and relevant Customer context
- same Reservation assignment operation opens from Reservation and Room context
- Reservation assignment does not accidentally create Stay
- Stay creation/check-in path is explicit
- account/payment/checkout effects remain correct
- focus/return context preserved
- rooms-only / folio-off / menu-off capability combinations remain valid

Recommended reasoning: **GPT-6 Astra High** for first implementation slice; use normal Codex/OpenCode/Muse for repetitive extraction and CSS once boundaries are established.

---

# Stage 5 — Restaurant Pilot

Goal: validate the same architecture under a high-frequency POS workflow.

## Target

```text
Floor
  → Table Workspace
      → Order
      → Payment/Close
      → Transfer
  → Floor
```

Default Table Workspace is main-surface/full-canvas rather than centered modal.

## Important constraints

- opening/inspecting a table must not accidentally create an order unless explicitly chosen as final UX
- preserve order note flush/race protections
- card and workspace order transitions converge on one handler
- room-folio transfer becomes Table Workspace subflow
- do not invent split payment/payment-method ledger in this stage

## Exit criteria

Two pilots now demonstrate the same workspace grammar with different presentation appropriate to domain frequency, and common primitives are evidence-based.

Recommended reasoning: **GPT-6 Astra High** for the first pass, then normal models for mechanical cleanup.

---

# Stage 6 — Extract proven platform APIs

Status: **Implemented** — static workspace definitions, metadata-based presentation defaults,
typed return context/mode updates and shared feature page geometry/view navigation.
See [extraction audit](platform-extraction-audit.md) and [workspace APIs](workspace-platform.md).
Flow, feedback policy and domain operations intentionally remain local.

Only now generalize what Pension and Restaurant truly share.

Candidates:

- workspace intent types
- workspace host
- entity header/status layout
- tabs/modes
- action priority
- subflow lifecycle
- stale-result guard helper
- focus/return-context behavior
- typed feedback

Do not create a generic entity framework for concepts that remain domain-specific.

## Exit criteria

Room and Table implementations become simpler because shared code was extracted—not because they were forced into an abstract API.

---

# Stage 7 — Settings Platform v2

Status: **Implementation complete; external verification pending** — four category
workspaces, static settings metadata, category-owned Setup drafts/save, independent
resource lifecycles, immediate appearance and explicit actions. See the
[Settings audit](settings-platform-audit.md) and [Settings platform](settings-platform.md).
Only targeted checks run in the implementation session; broad gates are a separate handoff.

Goal: make future settings growth cheap and predictable.

## Architecture

Stable top-level categories:

```text
İşletme
İşletme Düzeni
Servisler
Uygulama
```

A category may contain local sub-navigation.

Only selected category renders as the main Settings workspace.

## Registry metadata

Introduce a registry for settings sections:

- id
- category
- label
- description
- search terms
- capability condition
- focus target
- persistence mode

## Draft model

Create category ownership for baseline, draft, dirty, validation, save state and discard.

Lift drafts that would otherwise be destroyed by tab unmount.

## Persistence modes

Explicitly classify each setting surface as staged, immediate preference or operational action.

Examples:

- business identity → staged
- appearance → immediate or explicitly staged, choose one consistent behavior
- update check → operation
- backup → operation
- device revoke → operation

## Save

Active category scoped.

Unsaved drafts in other categories cannot leak into the payload.

A backend patch contract is a later cleanup if the existing full save can safely merge against persisted baseline.

## Search

Search all registered metadata and navigate to/focus the field.

## Exit criteria

Adding a new integration setting normally requires registering a section, not editing one giant form/save pipeline.

Recommended reasoning: **GPT-6 Astra High** for state/save ownership; later settings section migration can use normal models.

---

# Stage 8 — Customer, Market, Menu, Finance, Messages, Dashboard, Calendar

Migrate feature by feature.

Priority:

1. Customer Workspace
2. Market page modes/workspaces
3. Menu
4. Finance
5. Messages/AI
6. Dashboard
7. Calendar

Rules:

- reuse canonical entity workspaces
- do not create feature-specific customer/product/reservation editors
- preserve Messages persistent webview lifecycle
- preserve Market cart/draft lifetime when mode presentation changes
- Dashboard/Calendar are launchers/projections, not new entity editors

Each feature updates its tests at the same time.

Implementation status (2026-09-24):

- Stage 8A — Customer Workspace: closed and verified.
- Stage 8B — Market Workspace: closed and verified.
- Stage 8C — Menu Item Workspace: closed and verified.
- Stage 8D — Finance Workspace: closed and verified.
- Next: Stage 8E — Messages / AI.

---

# Stage 9 — Sector / Feature contribution model

Only after the previous stages prove the shape.

Evaluate a declarative registration model for:

```text
sector
  capabilities
  navigation contributions
  dashboard contributions
  settings sections
  entity workspaces
  domain operations
```

Do not confuse this with a public plugin API.

The initial goal is internal modularity so a new sector does not require editing many central switch statements.

## Exit criteria

A test sector/feature can contribute navigation + settings + one workspace without copying another sector's page code.

Recommended reasoning: **GPT-6 Astra High or Extra High only if cross-repo dependency analysis warrants it**.

---

# Stage 10 — Legacy removal and documentation reset

Remove old easy/pro concepts, obsolete theme selectors/files, obsolete drawer-specific entity editors, historical UI contracts that conflict with v2, dead CSS, old source-text smoke assumptions and compatibility adapters whose replacement is complete.

Update AGENTS, UI rules, frontend architecture, design-system documentation and feature development guide.

Keep historical migration reports only if explicitly marked archival.

---

# Test strategy for every stage

Run the narrowest relevant tests continuously, then checkpoint.

At meaningful desktop architecture milestones:

```fish
npm run typecheck
npm run smoke:desktop-renderer
npm run design:audit:strict
npm run architecture:audit
git diff --check
```

Add domain-specific smokes for the touched feature.

Do not use GitHub Actions as the routine feedback loop while quota is constrained.

---

# Agent/model allocation

Use expensive reasoning where cross-domain semantics matter.

### GPT-6 Astra High

Best for domain-boundary changes, workspace/navigation foundation, first Pension slice, Restaurant workspace architecture, Settings state/save redesign and eventual sector contribution architecture.

### Normal Codex / OpenCode / Muse Spark

Best for moving existing JSX into new shells, CSS/token replacement, repetitive primitive conversion, smoke locator updates after target behavior is fixed, dead CSS/legacy cleanup and mechanical type propagation.

### Extra High

Reserve for a narrow problem only when High leaves unresolved dependency ambiguity. Do not use it for broad mechanical migration.

---

# Program completion criteria

Application Platform v2 is mature when:

- new feature pages have predictable anatomy
- entity editors do not multiply by feature
- operations are reusable across entry points
- Settings can grow by registering sections
- new sectors can compose platform contributions
- appearance is one configurable system
- presentation changes do not destroy drafts
- tests protect behavior rather than obsolete DOM geometry
- domain boundaries remain visible instead of being hidden by a unified-looking UI
