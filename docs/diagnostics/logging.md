# Desktop diagnostics

Yardımcı Asistan uses session-based structured diagnostics for desktop troubleshooting.

## Storage

Each desktop process start creates a new directory:

```text
data/logs/sessions/<session-id>/
  session.json
  events-001.jsonl
  events-002.jsonl
```

A session begins when Electron main starts. A normal quit records `endedAt` and `endReason`; a session without an end marker can indicate a crash or hard stop.

Event chunks rotate at 2 MiB. Retention keeps at most 30 sessions and approximately 50 MiB of session diagnostics. Old single-file logs are not part of the v2 contract.

## Event contract

Each JSONL line is one event with:

- `timestamp`, `sequence`
- `level`: `INFO`, `WARN`, or `ERROR`
- `process`: `main` or `renderer`
- stable `scope`
- stable machine-readable `event`
- human-readable `message`
- optional `operationId`
- optional sanitized `meta`
- optional sanitized error name/message/stack

Use stable event names so diagnostics can be filtered without matching prose. Prefer `domain.operation.state`, for example `sync.cycle.failed`.

## Privacy and secrets

Diagnostics are designed to be shareable with developers and coding agents, but they are not a data archive. Do not intentionally log customer message bodies, passwords, API keys, sync secrets, tokens, authorization headers, cookies, or unnecessary personal data.

The logger applies recursive redaction and size limits as a second line of defense.

D5 additionally masks API hash/auth key fields, SMS recipients/body, Instagram caption,
raw provider request/response metadata and staging URL/path/query values (including encoded
forms). This applies to main/renderer events, Error message/stack, sanitized console output
and support export of older sessions. Stable scope/event/operationId and safe outcome codes
remain available. Callers must still avoid collecting raw payloads or unlabelled secrets;
redaction is not permission to log them. Existing session files are not rewritten.
Hosting access/error/proxy logs require the separate rules in
`infrastructure/hosting/README.md`; PHP cannot control ingress access logs.

## Runtime capture

Electron main automatically captures:

- process warnings
- uncaught exception monitor events
- uncaught IPC handler failures
- `console.warn` and `console.error` as a compatibility bridge

Renderer automatically captures:

- `window.error`
- unhandled promise rejections

New application diagnostics should use the structured diagnostics API rather than relying on console mirroring.

## Investigation workflow

1. Start with the latest session.
2. Filter to `ERROR` and `WARN`.
3. Narrow by `scope` or `operationId`.
4. Expand the surrounding events when a failure is part of a multi-step flow.
5. Only add new diagnostics when the existing event chain cannot identify the failing boundary.

The desktop LogView and terminal helper commands are layered on this same session contract; they should not introduce a separate logging format.


## Terminal helpers

Coding agents and developers can inspect the same session data without opening the desktop UI:

```fish
npm run logs:list
npm run logs:latest
npm run logs:errors
npm run logs:latest -- --scope sync
npm run logs:latest -- --level ERROR --query timeout
```

Use `--session <id>` for a specific session and `--limit <n>` to change the displayed event count. Development defaults to `./data`; `YA_DESKTOP_DATA_DIR` or `--data-root` can point to another desktop data root.
