# Marketing sharing workspace

The work page has three stable projections: Taslaklar, Son paylaşımlar and Aktif web
içerikleri. Yeni paylaşım opens the sole authoring workspace. Main fields always occupy
the same positions; active channel selection changes values and enabled states only.
Text, media, audience, channel details and preview are temporary tools in the
same WorkspaceFrame boundary. Only one WorkspaceSubflowOverlay is open at a time;
Escape, close and discard return focus to its launcher. Media, audience and channel selections use a local working copy and change the main draft only on Apply.
Channel AI adaptation stages its result in that working copy. Upload/generation and
segment creation retain their real library/save lifecycle even when selection is discarded.
Upload is a visible library button, alongside a separate AI image section. A candidate
from AI never applies, publishes or sends without user action. Saved share drafts retain
channel, audience, template and local publication-time selections.

The page displays only enabled/configured channels from the existing main-process
registry. No account setup or permanent Settings shortcut is duplicated. WhatsApp uses
approved templates and parameter bindings; SMS uses canonical plain text capped at 160
characters. Website supports ordered images; Instagram uses the first selected image,
with its existing validation/conversion/staging and submission fences.

Share options live with MarketingContent. Publishing delegates to MarketingShareService
through thin session-gated IPC. It validates and atomically prepares/attaches all canonical
targets, prepares all audiences, then publishes/starts or schedules each target. A repeated
request never invents another provider post, campaign or schedule. Channel outcomes are
reported separately and existing pause/cancel decisions are respected. Submitted content
is ready and frozen; live Website edits use the same editor family in publication mode.

Record cards and analytics launch the selected read-only publication directly in the
canonical sharing workspace; drafts open for editing. “All” surfaces are selectors only.
Website revision editing is a mode of the same workspace, with the canonical expected
revision; Instagram remains immutable and retains status check/permalink actions.
Selected-channel preview is read-only, uses actual ordered media and approved template
bindings, and displays consent eligibility without claiming provider validation.

Web content management shows acknowledged publications and pending changes, with explicit
edit and removal confirmation. Removal remains pending until Website synchronization
acknowledges it. Provider acceptance does not claim delivery. The page-level Analytics
projection remains read-only. Publication/campaign metrics are also read-only inline
consumers in the selected channel section and retain unavailable-versus-zero semantics.

Composer timing is inline in the main workspace and edits only the existing startsLocal/timezone and now/scheduled fields;
submission creates one-shot plans. Submitted and direct publication detail use the same
centered, two-column MarketingShareWorkspace: selected-channel actual content/gallery and
outcomes on the left, applicable plans and bounded actual execution/publication history
on the right. The body owns scrolling; the footer retains workspace-level actions.
Preview is a temporary helper in the same modal boundary. Ordinary plan and outcome
operations never replace this workspace or navigate to another form. Campaign status,
counts and metrics are inline; the optional “Gönderimi yönet” link enters the distinct
canonical delivery operation for prepare/start/pause/resume/cancel.

Plans first show a compact summary and switch to the existing MarketingScheduleWorkspace
fields in place. Calendar and detail reuse useMarketingScheduleController and the exact
saveMarketingSchedule/transitionMarketingSchedule bridges with expectedRevision. Multiple
plans are selectable in the same card. Dirty plan selection is locked; switching result
channels preserves the dirty plan. Save/discard restore focus to the editor launcher;
close and page leave guard both draft owners, and busy operations block close. Terminal
plans cannot be edited and pending/claimed executions block save. Pause/cancel retain
the existing service semantics and never retract a running delivery/publication.
The frozen targetRevision changes only through the explicit updateTarget action carrying
expectedTargetRevision; edits never automatically swap to the newest publication.
Section errors preserve the draft. Cancellation/removal use withinModal confirmations.
Simple viewing performs reads only. History uses existing execution records, errors and
publication timestamps; no synthetic events are persisted or displayed.

Plans go to the existing main Calendar, using canonical occurrences and execution records.
Day/week/month views retain their canonical schedule launcher, editor and lifecycle actions. No marketing-specific calendar remains. All persistence stays behind
DesktopDatabase, all schema creation stays in db/schema.sql, and diagnostics contain IDs
and bounded outcomes rather than message bodies or recipient values.
