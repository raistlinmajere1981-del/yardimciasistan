# D7 — Unified Marketing Analytics

The accepted domain decision is D-041 in `DOMAIN_DECISIONS_V1.md`.
`MarketingAnalyticsService` owns read-only aggregation, date selection, totals, trends
and optional provider observations. It uses `DesktopDatabase` and a whitelisted fact
reader; Campaign, Publication and BusinessMessage stores do not own analytics logic.
No canonical entity transitions, D3 completion rules, scheduler behavior or provider
dispatch behavior change.

## Metric contract and channel matrix

`packages/shared/types/marketing-analytics.ts` defines typed normalized names, channel,
numeric value or null, source, measuredAt, freshness and availability. Zero is a measured
count; null never becomes zero in IPC or UI. Availability distinguishes no_data,
unsupported, unconfigured, disabled, permission_unverified, permission_denied and
refresh_failed. Local metrics have `current` freshness; external snapshots have
`fresh`/`stale`; missing observations are `unavailable`.

| Channel | Real local signals | Delivery / rates | External engagement |
| --- | --- | --- | --- |
| Website | Total publication records, publishing, ever published, ever unpublished, current failed; global confirmed active publications | Not applicable | No visits/views/impressions/clicks: **Ziyaret verisi toplanmıyor.** |
| WhatsApp | Prepared recipient cohort, pending/claimed, attempted, accepted, failed, skipped | Canonical BusinessMessage webhook delivery/read evidence; delivered/accepted and read/delivered | None; no extra polling |
| SMS / İleti Merkezi | Same canonical D2/D3 counts | Existing reconciliation really distinguishes accepted and delivered; delivered/accepted only with support and positive denominator. Read is unsupported | None; no extra polling |
| Instagram | Publication publishing, ever published, current failed | Not applicable | Publishing credentials do not prove Insights access. Production reports permission_unverified and makes no metrics HTTP requests. Optional verified adapter seam is described below. |

Acceptance is cumulative evidence from the canonical receipt/outbox or BusinessMessage
state/history. Delivery uses delivered/read webhook evidence; a read also proves delivery
when an earlier delivered webhook is missing. Failure is the current terminal local/provider
failure, excluding a subsequently delivered/read message. These counts overlap intentionally:
a previously accepted message may subsequently fail. Each recipient contributes at most once
to each metric, even if both Outbox and BusinessMessage describe its failure or skip.

`attempted` counts recipients with at least one persisted D3 processing attempt, not HTTP
requests or retries. Prepared/eligible count frozen preparation membership; skipped counts
include preparation and later suppression. Campaign details show lifetime frozen audience,
eligible, prepared, pending, attempted, accepted, delivered/read, failed and skipped counts.
An unprepared draft has no frozen audience; an explicitly prepared empty audience is zero.
Analytics never invokes audience preview or reselects Customers.

Website active count uses the last sync-acknowledged published snapshot, including while
an update/unpublish intent is pending or has failed. Desired state alone never implies a
publicly active publication. An acknowledged unpublish removes it from active count.

## Date, total and trend semantics

Backend resolves Son 7/30/90 gün as inclusive local calendar days, including today;
custom ranges are inclusive dates, at most 366 days. It validates calendar dates and named
IANA zones, converts local midnights into UTC, and applies an exclusive UTC end bound.
The existing pure D6 timezone conversion supplies compatible DST handling; the scheduler
is unchanged. Default timezone is the current local system zone because the application
has no separate business timezone setting. Persisted observations remain UTC ISO strings.

Overview selects campaigns/publications by createdAt and recipients by their preparation
createdAt. Counts describe their current outcomes, even when acceptance/delivery arrives
after the selected range. Daily trends use those same preparation/creation dates, so their
totals match overview counts. They are not event-time sending charts or historical
point-in-time reconstructions. The UI explains this explicitly. Active Website count is
a current global snapshot, independent of the range. Campaign and publication details
cover their lifetime independently of the overview range. Recent campaign rows also use
the full lifetime audience, including preparation outside the selected creation interval.

Empty range produces no_data rather than a fictitious observed zero. Existing historical
local counts remain readable if a service is later disabled/unconfigured. Summaries add
only available local values and label this scope; unsupported delivery never contributes
an assumed zero. Rates require a positive comparable denominator and numerator <= denominator.

## Optional provider capability and snapshots

`MarketingMetricsProviderAdapter` is an internal main-process interface:
`supportedMetrics()` and `fetchMetrics(target, range)`. A future concrete adapter must
verify official endpoint support, token permissions and canonical account binding. The
current D5 credential contract only guarantees basic/publishing scopes; **no production
Instagram Insights adapter is activated in D7**. No new permissions, OAuth flow, provider
or Settings persistence path is introduced. Mock adapters exercise the real normalized
snapshot lifecycle; they do not imply live Instagram access has been validated.

The bounded initial allowlist is reach, views, likes, comments, saves and shares. Provider
names may appear only in the optional adapter's internal providerMetric mapping; the
service whitelists fields and never stores/logs/returns that mapping or a raw response.
Values must be nonnegative safe integers with valid UTC measurement times.

When a verified adapter is supplied, observations are publication-lifetime metrics, not
engagement attributed to the overview interval. They appear in existing publication
detail with measuredAt and freshness. Reach is not summed between posts; neither missing
post observations nor unavailable permissions produce channel totals.

`marketing_metric_snapshots` stores only normalized numeric observations, business and
target type/id, channel, opaque provider identity, range scope, measuredAt and expiresAt.
Lifetime uses the publication creation instant and an open-ended range key. A 15-minute
TTL is measured from measuredAt. Account/credential generation scopes isolate snapshots;
an adapter for a different canonical account cannot refresh/read the target's observations.
The table is bounded to 1,000 rows with oldest observation eviction. Local counts are
computed on read and are not cached. Canonical schema changes live only in schema.sql;
no historical migrations are added.

Reads never fetch provider data. Explicit refresh is single-flight, capped to one request
per minute globally and per target; successful measuredAt also enforces target cooldown
after service recreation. The in-process attempt map is bounded to 100 targets. Provider reads have a 15-second
abort/timeout bound and recheck session, database and account identity before writing. Failures
leave the last successful snapshot untouched, display its old number and measuredAt as
stale plus refresh_failed, and apply cooldown. Missing/invalid observations never become
zero. Production has no external refresh button while Insights access is unverified.

## UI, privacy and diagnostics

Pazarlama navigation is İçerik Stüdyosu / Kampanyalar / Yayınlar / Medya / Takvim / Analitik.
Analitik has a range selector, summary, four channel cards, light SVG trends with an
accessible daily table, channel result table and recent campaign/publication entries.
Entries open existing canonical workspaces; their analytics are read-only sections.
No nested modal, new chart library, tracker, cookies, attribution or customer analytics.
Appearance v2 semantic tokens and ActionButton are reused; channels stack on narrow screens.

Analytics IPC/service payloads never contain Customer names, phone numbers, message
bodies, titles, template parameters, credentials, staging tokens or provider responses.
Recent entries use channel/date/status and opaque canonical IDs; names/content belong
only to the existing canonical workspace outside analytics. Session lock gates IPC before
work and before response, while service/capability gates also protect direct execution.

Structured diagnostics scope is `marketing.analytics`; events are:
marketing.analytics.opened and marketing.analytics.provider_refresh.started/succeeded/failed.
Refreshes share an operationId. Metadata contains bounded counts and opaque publication
IDs only. Untrusted adapter errors are replaced at the boundary with an application-owned
Error before logging to avoid provider content/secrets in error stacks.

## Verification

The canonical registry owns `marketing-analytics` and `marketing-analytics-ui`, both in
the marketing domain with shared/desktop build prerequisites. SQLite/provider contract
coverage includes WhatsApp/SMS aggregation, unsupported delivery, Website acknowledged
active state, Instagram publishing and optional observation lifecycle, 7/30/90/custom,
inclusive/exclusive timezone boundaries and DST, privacy and canonical non-mutation.
Browser coverage includes summary/cards, measured zero/unavailable, filters, accessible
tables, canonical detail entry, stale/failure/permission states and responsive layout.
Full Verify and live provider checks are excluded.
