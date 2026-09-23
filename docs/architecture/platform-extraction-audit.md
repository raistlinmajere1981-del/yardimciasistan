# Stage 6 — Proven platform extraction audit

Compared the completed Pension and Restaurant implementations before code changes.
A = shared platform contract; B = domain similarity; C = incidental duplication;
D = insufficient evidence (wait for another consumer).

| Pattern / evidence | Class | Decision |
| --- | --- | --- |
| Room host in DesktopAppFrame, Table host in RestaurantPage; navigation repeats Table default | A | Static typed definitions bind entity, presentation and renderer in application composition. Keep host/context lifetimes; do not lift Restaurant orders into a global store. |
| Intent identity, leaf mode/action and Room customerId | A/B | Keep discriminated union and leaf fields. A base type for two common properties adds little; do not extract. |
| Return page/view/selection and focus | A | Discriminate return views by page; retain navigation callbacks and existing focus restoration. No scroll-offset persistence. |
| Identical page flex/toolbar/body CSS and one active body | A | FeatureWorkspacePage owns only toolbar/body geometry and region labels. State, filters and capability fallback remain in pages. |
| Both page selectors use nav + ActionButton + aria-pressed | A | FeatureViewSelector; never merge with entity WorkspaceTabs or legacy SegmentedControl. |
| Pension controller survives page switches; Restaurant state lives in page | B | Preserve current lifetimes. Restaurant initial order read merges late missing orders; not a latest-request-wins read. |
| Frame identity/context/actions/navigation/footer slots | A | Existing WorkspaceFrame already provides the contract. Room occupancy/planning and Table order/elapsed total remain domain markup. |
| Dynamic capability-filtered tabs | A/B | Existing dynamic tab arrays suffice; capability mapping remains in leaves. No engine or hidden/disabled API expansion. |
| Primary action, secondary actions and Table overflow | B/D | Existing ActionButton/IconButton and native details suffice. No action registry; another overflow consumer would be needed. |
| Flow begin/finish, dirty/busy, selected-tab focus return | B/C | Room prevents tab changes during flow and requires explicit discard. Table allows tab changes, flushes note drafts on return and coordinates committed transfers. Keep local lifecycle; two short focus calls do not justify a hook. |
| Message/error markup and footer | C/B | Room has independent Stay/Folio feedback and flow-only footer; Table has persistent auto-save/loading feedback and retry/save actions. A one-line paragraph wrapper adds no contract. No WorkspaceFeedback. |
| useRequestGeneration in RoomWorkspace, Folio controller, Table order/transfer reads | A | Existing begin → isCurrent API is proven. Preserve it. New generation and unmount invalidate old reads/completions. |
| Mutation completion guards | B | Room uses generation for mutations; Table serializes mutations/note flush with alive/order identity checks. Do not replace these with a universal async controller. |
| Close guard, entity key, lock, presentation switch without remount | A | Preserve navigation/ModalSurface ownership and strengthen behavior tests. |
| Generic repository/editor/operation, plugin registration, capability language | D | Not proven by the pilots. No framework or runtime discovery. |

Platform owns navigation, static definition/host contracts, presentation state, frame,
tabs, page geometry/view selection, focus/close guards and generation validity.
Pension owns Room projection, Stay/Reservation/Folio, cleaning and RoomAccount.
Restaurant owns TableOrder, menu/order editing, note flush, order close and room-folio
transfer UI. Operations, payloads, user messages, persistence and IPC are unchanged.
