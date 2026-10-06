# Marketing sharing workspace

The work page has three stable projections: Taslaklar, Son paylaşımlar and Aktif web
içerikleri. Yeni paylaşım opens the sole authoring workspace. Main fields always occupy
the same positions; active channel selection changes values and enabled states only.
Text, media, audience and channel details are explicit workspace subflows. A candidate
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

Web content management shows acknowledged publications and pending changes, with explicit
edit and removal confirmation. Removal remains pending until Website synchronization
acknowledges it. Provider acceptance does not claim delivery. Analytics remains a separate
read-only view and retains unavailable-versus-zero metric semantics.

Plans go to the existing main Calendar, using canonical occurrences and execution records.
Day/week/month views open the same schedule workspace for edits, recurrence and lifecycle
actions. No marketing-specific calendar remains. All persistence stays behind
DesktopDatabase, all schema creation stays in db/schema.sql, and diagnostics contain IDs
and bounded outcomes rather than message bodies or recipient values.
