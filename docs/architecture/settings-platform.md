# Settings Platform v2 — Stage 7

Status: implemented; external verification pending. The pre-change audit is archived in Git history and
records actual source-of-truth, draft, validation, gates, APIs and feedback owners.
Constitution and D-007/D-013/D-014/D-016 remain authoritative. Stage 6 Page / Entity
Workspace / Operation contracts and static Room/Table composition are unchanged.

## Categories and static definitions

| Category | Canonical sections | Persistence |
| --- | --- | --- |
| İşletme | Identity/contact, sector + optional capabilities; public business profile | Setup staged; separate profile resource |
| İşletme Düzeni | Room collection/profile/default nightly prices, table categories | Transactional BusinessLayout staged resource |
| Servisler | WhatsApp/birthdays, Android/local network, product data, web sync, AI profiles | Setup staged; connection/device actions remain commands |
| Uygulama | Appearance, update preferences, password/security, updates and backups | Immediate appearance; staged update preferences; explicit commands |

`app/settings-registry.ts` contains static TypeScript category and section definitions:
id (also the focus target), category, title, keywords, persistence kind and a narrow
visibility predicate. It contains no form schema or component generator. Search and
category staged-action availability consume the same metadata. Components retain
normal typed props and field handlers. A new section contributes metadata plus an
explicit component in the category composition, not a runtime plugin.

Persistence kinds are `staged`, `immediate`, `action`, `resource`. Mixed surfaces have
separate metadata entries: web/AI configuration vs tests, Android configuration vs
device operations, update preferences vs check/download/restart.

## Setup draft ownership and save

`useSetupController` holds app canonical DesktopSetupData and the existing
saveInitialSetup bridge operation. `SettingsWorkspace` owns active category/search and
`useSettingsDrafts`; no draft or save-status state was added to DesktopAppView.
The obsolete app-wide header Save/ref/status chain was removed.

`settings-draft-model.ts` assigns every SetupFormState field to exactly one of the
three staged categories. This reuses `toSetupForm` and one `createSetupInput` serializer,
not a second setup model. Table row presentation keys are excluded from dirty equality.
A persisted zero room count stays zero; the existing two-room suggestion applies only
to an incomplete first setup. First-run generated sync secret remains stable across
bootstrap refreshes.

A Business or Services category save:

1. Locks that category's staged controls and Settings transitions.
2. Reads the latest canonical setup using existing getSetupData.
3. Merges only the active category's owned fields over that canonical snapshot.
4. Validates that category; other Setup fields contribute only persisted values.
5. Calls the existing setup:saveInitial API through the app controller, preserving
   backend capability/security gates, encrypted keys, normalization and side effects.
6. On success replaces the Setup draft/baseline with the committed snapshot. Because
   Settings permits at most one dirty category, no second hidden dirty Setup draft is
   preserved or rebased. Failure preserves the active draft.

Operations bypasses setup:saveInitial entirely. getBusinessLayout/saveBusinessLayout
owns the room collection and table categories and commits both in one database
transaction.

Birthday validation and table-category validation reuse existing rules. The pure
browser-safe table-category validator moved to shared; the Electron module re-exports
it and retains desktop reconciliation. Database-dependent validation (protected tables,
secret persistence, etc.) remains in the backend. No IPC or schema change.

Clean Setup categories follow canonical refresh. The single active dirty category is
not overwritten by an external refresh; explicit discard resolves it against the latest
canonical snapshot. Category/search/page transitions never silently save or discard:
they open the common save/discard/stay decision. Controls are locked while persistence
is in flight, so edits made during a save are not retained through a rebase. A backend
local commit with a web-publication or capability-refresh warning advances canonical
state and reports that warning without pretending local persistence failed.

Sector selection retains the existing defaultOptional reprojection on an explicit
sector change. Same-sector refresh never reapplies defaults: Customer Credit and Android
remain opt-in. Required capabilities have no off switch; only supported optional
capabilities render in BusinessProfileOptionEditor. Resource/API gates use persisted
capabilities, so an unsaved sector selection cannot authorize an operation. Unsupported
room/table/product-data draft fields never enter category payloads. Their pending values
survive while hidden and reappear if the sector is restored; discard removes them.
A save reports when unsaved local values remain after excluded fields are preserved.

First setup uses the same categories: save business identity first, then other category
drafts. Only the selected category is committed even when completing initial setup.
There is no save-all shortcut.

## Independent resources and actions

Public Profile, Room Management, Update preferences and Password controllers are domain
hooks called above the category render boundary. Their forms unmount on category switch;
their drafts and operation state remain mounted. Resource dirty markers contribute to
the owning category indicator but never to Setup payload/save validation.

- Public Profile: getBusinessPublicProfile/saveBusinessPublicProfile, own validation,
  dirty, save/discard, saving lock and local result. No profile fields copied into Setup.
- Operations layout: getBusinessLayout/saveBusinessLayout owns rooms and table
  categories as one staged collection. RoomPublicDetailsEditor edits the same local
  collection draft; it no longer performs a separate database save. Room removal is
  staged and backend-protected, then archived transactionally on save. Folio-specific
  nightly price override remains a separate financial concept.
- Update URL/auto-check: saveUpdatePreferences remains its backend resource, but its
  draft participates in the Application category footer. Returning to the persisted
  value clears dirty state; Varsayılana Dön stages the default instead of persisting
  immediately.
- Password change/remove/reset, update check/download/restart/default reset,
  device role/permissions/install/revoke and maintenance commands are explicit actions.
  No category Save invokes them. Errors/results belong to their respective sections.

Appearance remains owned by DesktopAppView's existing immediate apply/save flow.
Scheme (including system), density, scale, accent, font and motion and the v2
localStorage contract are unchanged. It never marks a category dirty.

## Navigation, search, layout and accessibility

One active role=tabpanel renders. SettingsCategoryTabs is a narrow sibling-tab primitive:
role=tablist/tab, aria-selected/controls/labelledby, selected tab stop and wrapping
Left/Right/Home/End activation. It is separate from entity WorkspaceTabs and page view
selectors. Dirty state is textual, not color-only.

The existing Page Header is followed by a named search field, fixed category navigation,
fixed category header, one flexible local scroll body and contextual category actions.
Application has no category Save. Responsive forms use one column at narrow widths;
category tabs scroll horizontally where necessary. The shell treats Settings as bounded
workspace content, avoiding document overflow. Legacy anchor primary navigation and its
CSS were removed; stable IDs remain solely for search/focus.

Search uses Turkish case-normalized metadata matching without dependencies/fuzzy engine
or customer/secret values. Keyboard-usable result buttons request the same guarded
category transition as tabs; query/focus state changes only after the transition is
accepted. App-level page navigation also consults the Settings leave guard before the
page owner changes. Section errors use role=alert and operation results use role=status.
Native time fields retain lang=tr-TR. Settings is not a modal; the existing bounded
room-details dialog and the unsaved-changes decision are each single-layer dialogs.

## Lifetime and deliberate limits

Guarantee: draft lifetime is the mounted Settings page. Category/search switches and
page navigation cannot destroy a dirty active draft without an explicit save/discard/stay
decision. Draft persistence across restart, generic rebase/CRDT, a global state library,
settings DSL/form generator/plugin discovery and backend Setup category-patch/versioning
APIs remain deliberately absent. A full Setup save read/merge is not a cross-process
atomic patch; BusinessLayout is separately transactional.

## Verification contract

`npm run smoke:settings-platform` uses installed Vite/Chromium, real Settings components
and the production setup controller with a deterministic preload fixture. No builds,
Electron packaging or broad E2E chains. It covers active DOM/ARIA/keyboard, dirty/save/
discard/failure/double submit, clean/dirty refresh, hidden draft isolation, optional vs
required capabilities, resource APIs/failure retention, commands, search/focus, appearance
v2/system behavior, a single room dialog and 1440/1024/900/760/600 scroll geometry.

Existing Settings presentation fixtures were updated to select categories and invoke
explicit resource/action saves; their business assertions remain. Full renderer/pilot/
lint/knip/design/architecture/Linux verification is intentionally delegated to the
separate verification session; see the handoff in the implementation report.
