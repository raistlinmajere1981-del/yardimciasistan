# Desktop sync identity

Each local SQLite database owns one `desktop-<UUID v4>` identity. It is created
by `DesktopDatabase.initialize()` using `randomUUID()` and persisted in the
singleton `desktop_sync_identity` row (`id = 'primary'`).

`getSyncRuntimeStatus().clientId` reads this row. Business profile selection,
setup edits, network availability, and application restarts do not create or
replace identities. A fresh database after reset receives a new identity;
restoring a database backup retains the backed-up identity.

Initialization holds a `BEGIN IMMEDIATE` transaction across baseline checks,
demo seeding and identity creation. The singleton primary key and
`ON CONFLICT(id) DO NOTHING` prevent concurrent initializers from replacing an
identity. No identity is hardcoded in the baseline SQL.

Databases already marked `001_baseline.sql` also initialize this local metadata
table on startup. If that current baseline previously issued an identity in
`settings.sync_client_id`, its value is retained once; an empty value receives a
new UUID. From then on the singleton is authoritative. This does not accept
pre-baseline migration chains or modify hosting.

The original helper depended on an existing settings row. Fresh production
startup deliberately creates neither business nor settings rows, so it skipped
identity creation; subsequent setup inserted settings without invoking the
helper. Demo-based smokes had a settings row and concealed this lifecycle bug.
The helper itself was not removed by baseline cleanup. Commit `96152a5` had
already made the former automatic demo-seed path opt-in; the old
`010_automatic_sync.sql` only added the settings column and runtime seeds.

`scripts/smoke-database-baseline.mjs` covers the UUID format, direct SQLite
persistence, repeated and concurrent initialization, restart, independent fresh
databases, Market setup, backup restore, existing baseline databases and an
offline sync attempt reaching the transport.
