# Yardımcı Asistan — Feature Development Guide

This is the current implementation guide for new desktop features after Application
Platform v2. The Constitution and Domain Decision Register remain authoritative when a
domain boundary is ambiguous.

## 1. Classify the surface first

Before writing JSX, classify the work as exactly one primary concept:

- **Page** — an operational lens such as Pension, Restaurant, Market or Messages.
- **Entity Workspace** — the canonical editor/working area for one entity.
- **Operation/Subflow** — a business action such as assignment, payment or checkout.
- **Projection** — read-only/derived summary or launcher such as Dashboard or Calendar.
- **Setting** — configuration with staged, immediate or action persistence semantics.

Do not solve classification ambiguity by adding another editor.

## 2. Reuse canonical ownership

If an entity already has a Workspace, open it through Workspace navigation instead of
creating a feature-local editor.

Current canonical examples include Customer, Room, Table and Product. Menu opens Product
Workspace with Menu channel context; it does not own another product editor (D-011).

Presentation may be centered or full-canvas. Presentation is not a second workspace and
must not destroy the mounted entity draft/state.

## 3. Use capabilities, not sector-name switches

Business Profiles define allowed workflow roots and their canonical dependency closure
under D-048. Runtime UI composition uses the persisted
`BusinessCapabilitySnapshot.enabledCapabilities`.

For static contribution visibility, use the bounded `CapabilityCondition` contract.
Do not add profile-id/business-type branches as a substitute for capabilities.

Backend/domain mutation gates remain authoritative even when a UI contribution is hidden.

## 4. Navigation contribution

Use the typed static navigation contribution seam when a feature owns a Page contribution.

A contribution owns:

- page id
- icon/order
- optional capability condition
- presentation metadata
- shell content-scroll mode

Keep special lifetime behavior explicit. Do not build a dynamic plugin loader.

## 5. Settings contribution

Staged fields belong to one of the existing Settings categories and to the existing
field-ownership map.

A staged contribution may update only its category-owned draft.

Use separate lifecycles for:

- Appearance immediate preferences
- update/backup/password/device operations
- resource managers with their own loading/mutation state

Do not add a second save pipeline.

## 6. Entity Workspace contribution

Feature-owned workspace definitions may live with the feature and join the static
workspace-definition aggregate.

A definition describes composition/presentation; it does not own a second domain service.

Keep host lifetime where current behavior requires it. Messages, Market Quick Sale,
Finance and Calendar have deliberately specialized lifetimes that should not be forced
through a generic registry.

## 7. Domain operations

Prefer existing domain/controller operations.

Do not introduce a generic command bus, service locator, dependency container or universal
operation registry merely to make features look declarative.

If two entry points perform the same business operation, converge them on the same
operation/service rather than copying the workflow.

## 8. Styling

Import application CSS only through `src/styles/index.css`.

Use semantic/component tokens and shared primitives. Feature styles own feature layout,
not global shell geometry or a parallel palette.

Appearance v2 axes are scheme, density, scale, accent, font and motion. Do not add
easy/pro, `data-theme`, `data-mode` or feature-specific theme branches.

## 9. Tests

Prefer this order:

1. domain/service behavior
2. platform contract
3. browser behavior
4. minimal source-structure guard only when no executable contract is practical

Do not preserve migration-era DOM geometry through regex/source-text smoke tests.

Useful verification flow:

```fish
npm run verify:dev
npm run verify:domain -- <touched-domain>
npm run verify:pre-main
```

Use `npm run verify:check -- <id>` for a single failing contract and
`npm run verify:list` to discover ids. The canonical runner owns build/typecheck
prerequisites and de-duplicates them; do not manually stack old aggregate suites.

## 10. Definition of done

A new feature is ready when:

- ownership is unambiguous
- no duplicate entity editor/operation was introduced
- capability behavior and backend gates agree
- state lifetime survives expected presentation changes
- Settings ownership is explicit where applicable
- focus/close behavior is correct for workspaces
- behavior tests protect the user-visible/domain contract
- Knip and architecture/design audits do not report new debt
