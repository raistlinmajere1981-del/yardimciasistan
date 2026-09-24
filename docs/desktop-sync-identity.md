# Desktop Sync Identity

Desktop sync identity is current local metadata owned by the singleton
`desktop_sync_identity` table.

Fresh database initialization creates one `primary` row with a generated
`desktop-<uuid>` client id using `ON CONFLICT(id) DO NOTHING`. This makes
concurrent first-start initializers converge on the same persisted identity.

The `settings` table does not contain a sync identity field and there is no
handoff from an older settings shape. Historical database migration chains are
not supported.

A normal restart preserves the singleton identity. Restore preparation deliberately
clears runtime success/error state and then republishes current state using the
restored database's current identity lifecycle; request cursors are retained so
new hosting requests can still be pulled.

`scripts/smoke-database-schema.mjs` covers UUID format, direct SQLite persistence,
repeated and concurrent initialization, restart, independent fresh databases,
Market setup, backup restore and an offline sync attempt reaching the transport.
