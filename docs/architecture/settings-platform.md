# Settings Platform v3

The application constitution and domain decision register remain authoritative.
Settings reuses the existing Setup, public-profile, service and BusinessLayout owners.
There are no category tabs, alternate editors or schema migrations.

## Page composition and setup

The search and Web Connection bar precede one scrolling Settings page. Business
Structure and Features contains the sector, capability choices and compact service
grid cells. It opens during required setup and starts collapsed on each normal visit.
Successful setup collapses it once drafts are clean. Users can expand it again.
Business Information remains on the same page, with contact fields, room/table
management, map, public details, languages and social links. Its outer panel body
owns the shared padding; subsections do not add another panel inset.

Company name is optional. Sector selection and the business Save complete setup.
Automatic sync requires main-process verification of the exact effective web URL
and secret during setup, activation or transport changes. With sync disabled,
offline setup requires neither a web test nor a web secret. Ordinary local saves
retain the existing transport validation policy.

Persisted runtime capabilities gate resource reads, service availability and device
actions. Sector names and unsaved capability selections never authorize operations.
The existing profile transition transaction preserves configuration/credentials and
resets feature activation according to the canonical owner policy. A saved sector
change uses the existing safe restart operation.

## Draft and save ownership

`useSetupController` owns canonical DesktopSetupData and the existing
`saveInitialSetup` bridge. `useSettingsDrafts` reuses `toSetupForm` and
`createSetupInput`; it does not introduce a second Setup model or persistence path.

- The bottom Save/Discard owns identity, contact, sector/capabilities and the separate
  public-profile resource. It never saves services. During initial setup it also
  includes the pending web configuration.
- `settings-service-fields.ts` defines the non-overlapping Setup fields for each
  service. Each service Save reads the latest persisted Setup, merges only those
  fields, validates and delegates to the existing bridge. Only that owner's draft
  and baseline advance. Failed saves retain their pending fields.
- External snapshots refresh clean owners independently. A dirty service cannot
  block refresh of another clean service; dirty owners retain their fields until
  explicit Save or Cancel. Cancel restores only its owner from canonical state.
- Google Reviews, KBS, TTS, dictation and Android permission groups retain dedicated
  persistence owners. Android activation and the transactional permission-group
  batch remain coordinated by the Android service overlay.
- Web Connection has its own draft, verification and Save after setup. It merges
  only transport fields and cannot commit pending business or service edits.
- Appearance applies immediately through the existing device-local preference
  owner. Sidebar updates retain their own preference Save/Discard and commands.

Local persistence can succeed while publication or projection refresh reports a
warning. Canonical state advances after that local commit; the result must not
pretend that persistence failed. Setup read/merge remains a full existing bridge
operation, not a new cross-process atomic patch API.

## Service surfaces and evidence

Every service uses `ServiceSettingsCard` in a responsive grid with 3–4 columns
on wide screens and fewer columns as space decreases. Each cell contains only a
name, an accessible activation indicator and a settings icon. Green means enabled;
neutral means disabled; actual connection errors may use warning. Configuration
and test/readiness states appear only in the service detail. One shared FormDialog provides
internal scrolling, keyboard focus handling and service-specific Save/Cancel.
Enabling or configuring a service never establishes successful test evidence.
Only actual provider/adapter checks establish readiness; unsupported tests say so.
KBS endpoint reachability alone is not authenticated credential verification.
Save failure is reported separately and does not replace a provider test result.

Escape, backdrop and close request the shared stay/discard-and-close/save-and-close
decision when the service is dirty. `ConfirmDialog` uses its existing `withinModal`
layer inside the same native dialog; the underlying form is inert until the
decision resolves. Staying restores form focus. Clean services close immediately.
Explicit Cancel discards only that service; a failed Save dismisses the decision
and keeps the service overlay and draft, with the error in the top message area.
An open service or layout overlay blocks page navigation. Pending business changes
use the shared save/discard/stay leave decision. Provider safety explanations remain
beside their controls; operation success/error messages use the global top bar.

## Resources and commands

Public Profile uses its existing get/save APIs and independent validation. Its
fields never enter Setup payloads. Room and table management share the transactional
BusinessLayout collection draft. Details edit that same collection; room/table media
retains its main-process staging and commit/discard lifecycle. Management and detail
surfaces share one modal boundary. The folio nightly-price override remains a
separate financial operation.

Device install/provision/role/active/revoke, password changes, update checks/install
and maintenance remain explicit commands. Revoke exits a clean Android overlay
before opening the global confirmation. Security and Data use non-modal action
surfaces; hidden backup managers are not mounted.

## Search, layout and lifetime

`settings-registry.ts` owns metadata: IDs, titles, search synonyms, persistence,
capability predicates and optional canonical service targets. Business/services
are metadata and field-ownership groups, not routes or tabs. Static typed service
contributions remain explicit components; there is no runtime plugin or form DSL.
Search never includes stored customer values or secrets. Matching normalizes
Turkish casing, including AI/ai. Result titles need not equal search terms.
AI Test and Phone Setup aliases open the same AI/Android service overlays.
Phone Setup requires committed Android capability; configuration of an available
but inactive Android service remains accessible through its Android row.
Other results focus their same-page target or open the existing room/table or
security/data surface.

The page owns vertical scrolling; dialogs own their bodies. Shared layout/spacing
tokens preserve light/dark and comfortable/compact appearances and avoid horizontal
overflow at the supported 900px desktop width. Draft lifetime is the mounted Settings
page. Restart persistence, CRDT/rebase machinery and a second global state library
are deliberately absent.

## Verification

`scripts/verification-registry.mjs` and `scripts/verify.mjs` remain the verification
authority. Settings platform/UI smoke uses real React components, the production
Setup controller and deterministic preload fixtures. Assertions cover independent
save/cancel, failed-save retention, clean-owner refresh beside dirty owners,
capability-gated search aliases, real test invocation, setup online/offline policy,
room/table ownership, keyboard dismissal/focus and responsive panel padding.
Settings correctness and setup/profile contracts exercise domain persistence and
verification evidence. TTS/STT and renderer checks cover their existing owners.
