# Yardımcı Asistan — Application Architecture Constitution v1

Status: **Authoritative target architecture for new desktop work**

This document defines the long-term application grammar for Yardımcı Asistan. It is intentionally broader than a UI redesign. Its purpose is to keep the project understandable as new sectors, settings, entity types, integrations and workflows are added.

When this document conflicts with older UI migration notes or screenshots, this document is the target direction. Existing business behavior, persistence rules, security gates and tested domain constraints remain authoritative until explicitly changed by a domain decision.

---

## 1. Goal

The project should scale without each new feature inventing its own page layout, editor, save model, dialog style, state ownership or navigation path.

A developer or coding agent adding a new feature should be able to answer these questions before writing UI:

1. Is this a **page**, an **entity**, an **operation**, a **setting**, or a **projection**?
2. Who is the canonical owner?
3. Which workspace should open?
4. Which existing operation should execute?
5. Which capability controls visibility and execution?
6. Who owns draft state and how long must it survive?
7. Who owns scrolling?
8. Which shared primitive should present it?
9. Which behavior-level test should protect it?

If these answers are unclear, the architecture decision comes before the component.

---

## 2. Core mental model

### Page = operational lens

A feature page answers:

> “What work am I doing in this area?”

Examples:

- Pension → Rooms / Reservations / Daily Work
- Restaurant → Floor / Active Table
- Market → Sale / Products / Inventory / Purchasing
- Settings → selected configuration category

A page must not become the second canonical editor for every entity it displays.

### Entity Workspace = canonical place to work on one entity

An entity workspace answers:

> “Which room/reservation/customer/table/product am I working on?”

Examples:

- Room Workspace
- Reservation Workspace
- Customer Workspace
- Table Workspace
- Product Workspace

Different pages may open the same workspace. The entry point may change; the entity behavior must not fork.

### Operation / Subflow = a real business action

An operation answers:

> “What am I doing to this entity?”

Examples:

- assign a reservation to a room
- create a stay
- check in
- add a folio charge
- record a payment
- close an order
- receive a purchase

Operations are not named after presentation components. Avoid concepts such as `saveRoomDrawer` or `closeOrderModal`.

### Projection = read-only or derived view

Dashboard cards, calendar rows, room tiles, status summaries and finance totals are projections. They can repeat useful summary information, but must not become independent editors.

---

## 3. Canonical ownership rules

### 3.1 One entity, one canonical editor family

The same entity must not acquire multiple feature-specific editors over time.

Allowed:

- full Customer Workspace
- compact Customer Create mode using the same field model and validation source

Not allowed:

- Pension Customer Editor
- Restaurant Customer Editor
- Market Customer Editor

### 3.2 Multiple entry points are valid

Multiple buttons may lead to the same action when they are useful in context.

Example:

- Reservation → “Oda Ata”
- Room → “Rezervasyon Ata”

These may both exist. They must converge on the same canonical reservation-room assignment operation, with the already-known side preselected.

### 3.3 Similar-looking actions are not automatically the same operation

Current important distinctions:

- Reservation → Room assignment is not the same mutation as Customer → Room / Stay creation.
- Stay checkout is not currently equivalent to Folio checkout.
- Customer credit is not Room Folio debt.
- Menu Item is not Catalog Product.
- Product is not Stock Movement, Purchase or Sale.
- Table is not TableOrder.

UI consolidation must preserve domain boundaries.

---

## 4. Navigation model

### 4.1 Global navigation

The existing shell remains the stable global coordinate system:

- primary sidebar
- global/page header
- global status and truly global actions
- bounded feature content area

### 4.2 Workspace intent

The desktop needs an application-level navigation intent capable of representing more than `activePage`.

Target shape, not a required exact TypeScript API:

```ts
openWorkspace({
  entityType: "room",
  entityId: "room-101",
  mode: "account",
  action: "payment",
  returnContext: {
    page: "pension",
    view: "rooms"
  }
})
```

The important contract is:

- entity identity is explicit
- mode/subflow is explicit
- entry context can be restored
- the same workspace can be opened from Dashboard, Calendar, Customer, Pension, etc.
- opening an entity must not silently create a second editor implementation

### 4.3 Return context

Closing or completing a workspace should normally return the user to the same operational context:

- same feature page
- same page mode
- same filters
- same meaningful scroll/list selection where practical

---

## 5. Surface escalation

Presentation is selected by task complexity, not by feature preference.

### Popover / mini surface

Use for compact information, small selection, overflow actions or small context menus. Never use for multi-field entity management.

### Drawer

Use only for supplemental information or a short task where the base page must remain visually referenced. Drawer is not the default entity editor.

### Confirm

Use for a consequential decision or discard/destructive action. Do not show confirmation for every successful operation.

### Form dialog

Use for one bounded conceptual task, such as create task, edit category or a small quick-create flow.

### Workspace

Use when the user is working on an entity with multiple related modes. A workspace has:

- entity header
- authoritative status/context
- stable tabs/modes
- scrollable body
- contextual actions
- optional footer only while committing a subflow

### Full-canvas presentation

A workspace may expand to full-canvas when density or task duration exceeds the centered presentation. This is the same workspace instance and state, not a separate editor.

### No nested modal as normal architecture

A workspace subflow changes the workspace body/mode instead of opening another modal.

Example:

```text
Room Workspace
  → Account
    → Payment mode
```

not:

```text
Room modal
  → account drawer
    → payment modal
```

Small destructive confirmation should preferably be an in-workspace confirmation state.

---

## 6. Scroll ownership

Operational pages must not grow indefinitely because unrelated work areas are stacked vertically.

Default desktop rule:

| Surface | Scroll owner |
| --- | --- |
| App shell | none |
| Sidebar | only its own navigation if required |
| Page header | none |
| Local toolbar | none where practical |
| Main workspace | fills remaining viewport |
| Workspace body | primary vertical scroll |
| Entity workspace header | fixed |
| Entity workspace body | scroll |
| Entity workspace footer | fixed when present |
| Data table horizontal overflow | table region |
| Calendar/floor canvas | its own intentional canvas behavior |

Independent master/detail scrolling is allowed when it improves high-frequency work, but nested scroll regions must be deliberate and limited.

---

## 7. State ownership

State belongs to the narrowest owner whose lifetime matches the user's expectation.

### App-level state

Use for state that must survive page transitions or is truly global, such as active page, application lock, persistent WhatsApp webview lifecycle, global diagnostics overlay and the global workspace navigation host.

### Feature-page state

Use for selected feature mode, filters, date range, list selection and page-specific scroll context.

### Entity-workspace state

Use for active entity tab, current subflow, draft being edited, centered/full-canvas presentation and async request generation / stale-result guards.

Changing presentation must not reset the workspace draft.

### Domain/persisted state

SQLite and existing domain services remain the source of truth. Do not introduce a second client-side cache merely to power a workspace unless the lifetime and invalidation contract is explicit.

### Draft preservation

If a UI mode/tab unmounts, state that users reasonably expect to keep must live above that presentation boundary. This is especially important for Settings category drafts, Market sale cart, TableOrder note edits and entity workspace forms.

---

## 8. Canonical operation layer

UI handlers should converge on domain-oriented application operations. This does not require rewriting all IPC channels.

A canonical operation may be a focused controller function that delegates to existing preload/IPC/service calls.

Target characteristics:

- named after business behavior
- no visual component name
- validates entry context
- calls one existing mutation path unless coordination is intentionally required
- maps result to common feedback
- refreshes the correct projection
- protects against stale async results when entity changes

Examples:

```text
assignReservationRoom
createStay
checkInStay
recordFolioPayment
checkoutStay
setRoomOperationalStatus
closeTableOrder
transferTableOrderToRoomFolio
saveRoomProfile
```

Do not create a generic global command bus unless real reuse proves it necessary.

---

## 9. Capability and sector rules

Capabilities remain the behavior gate. UI visibility alone is never the security/business boundary.

A new sector should preferably compose existing capabilities and domain modules before inventing sector-specific copies.

Long-term extension points may include navigation contribution, dashboard contribution, settings contribution, entity workspace contribution and operation/capability contribution.

However, **do not implement a generic plugin/sector registry before Pension and Restaurant pilots expose the real shared requirements**. Extract after evidence, not before it.

---

## 10. Settings Platform v2

Settings is a platform, not one giant form.

### Stable top-level categories

Prefer a small stable taxonomy. Initial target:

- İşletme
- İşletme Düzeni
- Servisler
- Uygulama

New sectors and integrations should normally contribute sections inside these categories instead of creating a new top-level tab. If a category becomes large, it can have local sub-navigation.

### Only the active category is presented

The active category fills the remaining Settings viewport. Its body owns scrolling. Other categories do not remain in the same document flow.

### Settings registry

Long-term target metadata for a settings section:

```ts
{
  id,
  categoryId,
  label,
  description,
  searchTerms,
  capability,
  focusTarget,
  persistenceMode
}
```

`persistenceMode` distinguishes staged/save-discard settings, immediate preferences and operational actions.

Do not pretend backup, update check, device revoke or password reset are ordinary staged fields.

### Dirty state

Dirty state is category-scoped. A user may switch tabs without being interrupted. Unsaved drafts stay alive and the dirty tab is visibly marked. Leaving Settings with dirty staged changes requires one clear decision.

### Save

Default: save the active category only. A global “save everything” action is not the primary contract.

A full backend patch API is desirable long-term, but UI category separation may initially merge the active category into the last persisted baseline and call the existing full save contract, provided unsaved drafts from other categories cannot leak into the payload.

### Search

Settings search is a first-class navigation path. Search metadata contains labels/descriptions/synonyms/capability conditions, never stored secret/customer values.

Selecting a result activates the correct category and focuses/highlights the target setting when possible.

---

## 11. Appearance Engine v2

There is one design system, not separate “easy” and “pro” themes.

Appearance dimensions are orthogonal preferences:

```text
color scheme: system | light | dark
accent: controlled preset
density: comfortable | compact
scale: supported percentage
font: controlled preset
reduced motion: on/off or system
```

### Principles

- Light and dark are color schemes of the same system.
- Comfortable and compact are density values of the same system.
- Scale is not a second layout implementation.
- Feature CSS must not branch on “easy/pro”.
- Accent choices are controlled palettes, not arbitrary color input by default.
- Fonts are controlled presets; arbitrary font files are not supported.
- Every supported combination must preserve contrast, focus visibility and control hierarchy.

### Token stack

```text
primitive tokens
    ↓
semantic tokens
    ↓
component tokens
    ↓
feature layout
```

Feature styles should not own palette, radius, shadow, typography scale or standard control geometry.

### Compatibility migration

Existing stored preferences may be mapped once:

- `theme: light/dark` → color scheme
- `mode: easy` → comfortable density
- `mode: pro` → compact density
- existing scale → scale

After migration, the legacy `mode` concept should disappear.

---

## 12. Shared interaction primitives

The goal is not the smallest number of React components; it is one visual/behavioral language per semantic role.

### Actions

- ActionButton: primary / secondary / danger / quiet
- IconButton: normal / selected / danger
- Overflow/Menu for secondary actions

A feature must not invent a new button family for domain branding.

### Navigation

- page mode selector
- entity workspace tabs
- local sub-navigation
- breadcrumbs/return context only where needed

Page mode and entity tabs may share base tokens but must have distinct semantic roles.

### Surfaces

- workspace
- section
- data row/list
- card only when card semantics are useful
- avoid panel-inside-panel visual nesting

### Dialog system

- Confirm
- Form
- Workspace

Drawer is separate supplemental presentation, not a fourth entity-editor type.

### Fields

- text
- numeric/money
- select/combobox
- date/time
- checkbox/switch
- field description/error

Add specialized controls only when semantics justify them, such as MoneyInput, QuantityControl and SearchField.

### Feedback

- field validation
- section message
- workspace-level error
- transient toast/status
- global notification

### Loading

- action/button busy
- section loading
- workspace initial loading
- measurable progress

Do not block the whole workspace when only one section is refreshing.

---

## 13. Feedback and motion

### Feedback locality

Show feedback as close as possible to the affected operation:

- field error → field
- section refresh error → section
- workspace load error → workspace
- global connectivity/system issue → global status

### Financial and stock mutations

Do not present success before the actual operation is confirmed, especially payment, finance entry, stock mutation, folio mutation and sale/purchase commit.

### Motion

Motion explains state transitions; it is not decoration. Workspace open/expand, tab changes, feedback and drawers must share the same motion family and respect reduced-motion preference.

---

## 14. Domain boundaries that UI must preserve

### Hospitality

```text
Room
  physical resource

Reservation
  planned booking

Stay
  occupancy relationship / lifecycle

Customer
  person/entity

Folio
  financial account for a stay
```

These may be shown together in Room Workspace, but they must not collapse into one data model or one ambiguous mutation.

### Restaurant

```text
Table
  physical/operational resource

TableOrder
  active order

Customer
  optional relationship

Payment/Finance
  financial effect
```

### Retail

```text
Catalog Product
  product identity/configuration

Inventory Movement
  stock event

Purchase
  procurement event

Sale
  sales event

Customer Credit
  customer ledger
```

Menu Item and Catalog Product remain separate until a dedicated domain-model project explicitly changes that decision.

---

## 15. Testing constitution

UI migration tests protect behavior, not historical geometry.

### Domain tests

Protect validation, transitions, persistence, financial effects, stock effects and capability/security gates.

### Platform contract tests

Protect workspace navigation intent, focus restoration, no nested modal, scroll ownership, dirty draft preservation, appearance preference application, settings registry/search and stale async result guards.

### Feature behavior tests

Protect user goals.

Prefer:

```text
open Room 101
→ account mode
→ record payment
→ total updates
→ return context preserved
```

over:

```text
.drawer--wide exists
```

Source-text tests are a last resort.

---

## 16. Diagnostics constitution

The session-based structured diagnostics system is part of the application platform.

New operations should log meaningful failure boundaries using stable scope/event names. Do not log every UI event.

When an operation spans multiple steps and a natural correlation identifier exists, propagate an `operationId`.

Diagnostics must remain shareable without secrets or unnecessary customer PII.

---

## 17. Migration rules

1. Preserve domain behavior unless a domain decision explicitly changes it.
2. Do not keep duplicate UI solely for compatibility with an old screenshot/test.
3. Replace presentation tests when architecture changes; preserve business tests.
4. Do not perform a repo-wide generic abstraction before two real pilots prove the abstraction.
5. Remove obsolete surfaces after canonical replacement is active; do not maintain two permanent editors.
6. Avoid compatibility adapters with no expiry. If one is necessary, document the removal condition.
7. New features must use the new architecture; do not knowingly add work to legacy patterns that are scheduled for removal.
8. Migrations should be vertical and usable: foundation → one real feature → validation → extraction.
9. Keep commits focused and reversible.
10. Do not mix unrelated database redesign into presentation work.

---

## 18. Initial canonical workspace map

| Operational area | Canonical workspace |
| --- | --- |
| Pension / Rooms | Room Workspace |
| Pension / Reservations / Calendar / Dashboard | Reservation Workspace |
| Customer Work | Customer Workspace |
| Requests | Request Workspace |
| Restaurant / Floor | Table Workspace |
| Menu | Menu Item Workspace |
| Market / Products | Product Workspace |
| Market / Quick Sale | Sale Workspace |
| Market / Inventory | Inventory Workspace |
| Market / Purchasing | Supplier / Purchase Workspaces |
| Finance | Finance Workspace |
| Settings | Selected Settings Category Workspace |

This map can grow, but a new workspace requires a real entity/operational ownership reason.

---

## 19. Non-goals

This architecture does not require rewriting all Electron IPC, converting the whole app to a generic state library, a plugin marketplace, a generic command bus, a generic data-grid everywhere, merging Menu Item and Catalog Product, converting every dialog to a full page, removing all drawers or making every feature geometrically identical.

The project shares grammar, state rules, primitives and ownership—not identical screens.

---

## 20. Success criterion

The architecture is working when a new sector or feature can be added without another custom page anatomy, another entity-specific drawer clone, another settings save model, another button language, another theme branch, duplicated domain mutation handlers or layout tests that freeze old implementation details.

The system should grow by composition, not by accumulating parallel solutions.
