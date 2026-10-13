# Voice input — S2A / S2B contract

## Product boundary

Speech recognition returns editable text. It never submits a form, executes a
command, mutates business data or creates an Android action. The user reviews text
and explicitly submits it through the existing operation and permission boundary.
Desktop and Android upload audio **directly to Hosting**; Desktop never relays
phone audio. Local TTS remains the default. Optional Freya is future work.

## S2A: saved preference and hosted service

`ai_service_profiles.stt_model` is the canonical per-provider SQLite preference.
Empty means disabled. Setup/preload uses active `aiSttModel` and profile
`sttModel`. Existing Services drafts, Save, Discard, provider switching and secret
lifecycle own it. Omission by an existing Setup caller preserves the stored choice;
explicit empty disables it. Current schema only: no migration, compatibility shim
or startup backfill. Existing databases lacking stt_model are incompatible with
the current schema and may require the application's explicit clean-start flow;
no silent reset, data deletion or auto-migration is performed.

| Service | Verified model allowlist | Provider request |
| --- | --- | --- |
| OpenAI | `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1` | Multipart `POST /v1/audio/transcriptions`, `CURLFile`, JSON response |
| Google AI Studio | `gemini-2.5-flash` | REST `POST /v1beta/models/{model}:generateContent`, base64 `inline_data`, text output |
| Groq / OpenRouter / custom | Disabled in S2A | No verified adapter/model contract installed |

Gemini is an audio-capable multimodal model, not a dedicated transcription model.
Chat discovery and text/image connection checks do not prove audio capability or
account access. The list never auto-selects a model or uploads a recording. Google
may restrict Gemini 2.5 access for new projects; account failures remain visible
sanitized errors. There is no chat fallback or alternate-provider fallback.

Evidence: [OpenAI transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create),
[Gemini 2.5 Flash modalities/access](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash),
[Gemini audio formats](https://ai.google.dev/gemini-api/docs/audio),
[Gemini generateContent schema](https://ai.google.dev/api/generate-content).
Additional models/providers require audio support evidence, authority validation,
adapter tests and matching Hosting policy; name patterns alone are insufficient.

## Durable publication

The existing private `ai_settings` body carries active `stt_model`. Other profiles
remain local until selected. STT-only changes invalidate the existing outbox.
Frozen payload encryption, source epoch, exact body/hash/identity receipt, restart
retry and conditional completion stay under publication protocol v3. An older
in-flight STT receipt cannot mark a newer selection published.

Hosting applies STT with private AI config and the receipt in one transaction.
`config/ai.php` merges host defaults first, applied private config last. The STT
default is empty even when a chat key/model exists. Keys stay in OS-encrypted
Desktop profiles/frozen payloads and protected Hosting private configuration;
they never enter public projections, phone responses or logs.

## Endpoint contract

`POST api/audio-transcribe.php` accepts multipart `source=desktop` and exactly one
`audio` file, at most **5 MiB** (5 × 1024 × 1024 bytes), authenticated with the
existing `X-YA-Sync-Secret` Desktop credential. Other methods return 405
(`Allow: POST`); query input and browser CORS are unsupported. Hosting checks
published persisted `service.ai`, enabled AI config and the configured STT model.
An offline capability withdrawal takes effect remotely after publication arrives.
Session-unlock/capability gates at the Desktop capture boundary belong to S2B.

Android device/token headers and `source=android` are denied. Companion v3 has no
canonical generic dictation permission. Reusing report/customer/settings permission
would broaden its meaning, so S2A exposes only Desktop authentication. Holders of
the shared Desktop sync secret retain its existing authority; it is not a phone
STT credential. No Android Java code or Companion v3 scope changes here.

`finfo` validates content MIME, ignoring uploaded MIME/name. Supported containers
are WAV, MP3/MPEG, FLAC, OGG, WebM, MP4/M4A; Gemini also accepts AAC/AIFF. Container
MIME does not prove an intact speech stream: decoding failures remain provider
errors. Upstream filenames are generated. Malformed forms, upload errors, empty
files and excessive actual size are rejected. Host limits must allow
`upload_max_filesize >= 5M`, `post_max_size >= 6M`; the application cap remains 5 MiB.

STT accepts a configured base URL only at the exact official API root
`https://api.openai.com/v1` or
`https://generativelanguage.googleapis.com/v1beta` (optional trailing slash).
Other hosts/proxies, HTTP, userinfo, ports, path overrides, queries and fragments
are rejected. cURL verifies TLS, permits HTTPS only, follows no redirects, does
not inherit a proxy and keeps keys in auth headers. Total timeout is capped at
60 seconds (connect at 10); response reading at 128 KiB. Transcripts above 16,000
UTF-8 characters fail instead of truncating. Gemini thought/tool outputs are not
returned. Errors contain fixed codes/messages, never raw provider/cURL details.
Control characters/HTML tags and exact provider-key echoes are cleaned from text.

Success is `{"ok":true,"text":"..."}`; silence may produce empty text. Failures
use `{"ok":false,"code":"...","message":"..."}`: 401/403 gates, 413 size,
415 format, 422 input/config, 502 provider, 504 timeout. Responses are `no-store`.
No transcript history, audio object store, conversation record, action receipt
or automatic billed transcription retry is introduced.

PHP upload files stay transient and are deleted on success, rejection, exception
and shutdown. They are never moved to application data. Use a private ephemeral
upload directory; RAM/tmpfs is required where audio must never touch disk. A
process/host crash before cleanup depends on that directory's host lifecycle.
The endpoint disables PHP display/error logging. Hosting/proxy/APM must keep body
and auth-header capture disabled; application code cannot control upstream tracing.

## S2B: microphone and Android direct input

Next step owns Desktop start/stop/cancel, an unlocked/capability-gated Electron
upload operation, stale-result cancellation, editable insertion and explicit user
submission. Each capture is opt-in. Provider keys are never capture-client inputs.

Android S2B first defines a dedicated persisted dictation permission, admin/staff
defaults and capability intersection. Its direct Hosting request must validate
the canonical device token, matching header/body identity, current active approval
and that permission, with no shared-secret audio fallback. Revoked/inactive/denied
phones fail before provider transport. The phone gets text, never the provider
key. Any later command uses its own existing permission/mutation path. This is
future work, separate from the supported Companion v3 workflows.

## Verification

`npm run verify:domain -- voice` registers provider format/security mocks,
HTTP upload/cleanup/private-publication tests with mocked provider transport,
real PHP/SQLite publication/endpoint-gate tests through a CLI transport, SQLite
draft/persistence/exact receipt/restart tests and targeted Settings browser
smoke. No live provider calls or recording-quality claims. Localhost/browser
restrictions are blocked checks, never hidden skips/passes. Full pre-main, real
devices/recordings and live deployment are outside S2A verification claims.
