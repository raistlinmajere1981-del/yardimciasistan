# Business Messaging — D1 / D-035

The desktop operates on `BusinessMessage` intents through `BusinessMessagingService` and
a typed provider adapter. `WhatsAppCloudProviderAdapter` owns Meta Graph requests. Customer,
Order, Sale and existing WhatsApp Web/prepared-message state remain independent.

## Configuration and credentials

Settings → Servisler → WhatsApp Business contributes `whatsappCloud` to the existing staged
Setup save transaction. Configuration accepts disabled or incomplete accounts. WABA ID and
Phone Number ID are provider config; access token is write-only and encrypted by main's
safeStorage into `business_messaging_provider_config.access_token_encrypted`. Operating
system secure storage must be available (Linux `basic_text` is refused). Reads return only
ids/flags. Encrypted keys cannot be used on a device where the OS key store cannot decrypt.
A connection test reads the WABA phone list and selected phone resource, proving token
access and WABA/phone membership without sending or modifying Meta state.

Hosting requires these environment values, configured outside versioned files/publications:

- `YA_WHATSAPP_VERIFY_TOKEN`: a private verification token also entered in Meta webhook setup.
- `YA_WHATSAPP_APP_SECRET`: the Meta application secret used to verify POST signatures.

The desktop access token stays on desktop. App secret/verify token stay on hosting. The
existing private hosting `sync_secret` authenticates status pull/ACK and is never sent to
Meta. No new credential publication path exists.

Subscribe the Meta application to its WABA and `messages` status events with the HTTPS
callback `<web-module-base>/api/whatsapp-webhook.php`. GET accepts PHP-normalized `hub_mode`,
`hub_verify_token`, `hub_challenge` and the equivalent dotted keys. POST compares
`X-Hub-Signature-256` to HMAC-SHA256 over the unmodified raw bytes with constant-time equality.
Without environment secrets the webhook is unconfigured (GET rejects, POST returns 503).
Deploy the updated hosting package before expecting status delivery.

## Activation

1. Enter account ids/access token in Servisler; enable the separate Business card.
2. Test the connection, then save Servisler. Testing does not save draft credentials.
3. Open a canonical Customer with a valid international phone.
4. Open **WhatsApp Business mesajı**, choose an approved template/language, fill parameters,
   review its text preview and send once.
5. The desktop-generated local id stays stable; provider success records `providerMessageId`
   and accepted state. Workspace displays both ids/status.
6. Signed webhook delivery/read/failure status enters the focused inbox. Existing automatic
   sync (or an explicit ordinary sync) pulls statuses and updates the mounted operation.

The original **WhatsApp'tan Yaz** action and Web preference work independently, including
when Business is unconfigured/disabled. The Business action does not require Web enabled.

## Transport and idempotency

`business_messages` owns provider-neutral lifecycle data. `business_message_provider_bindings`
owns the provider account hash, intent fingerprint and durable submission claim. The main
process resolves canonical Customer phone, validates approved template and ordered text
parameters, and snapshots the recipient. Values stay in memory; only a fingerprint persists.
Changing Customer phone before submission requires a new intent. Changing provider account
cannot reuse an intent created under another account.

After catalog HTTP, single-message sends recheck the central session gate, maintenance/shutdown,
current database/business, persisted Customer capability, enabled provider and decrypted credentials.
The same synchronous check runs after the durable claim, immediately before provider POST.
Once POST starts, receipt/failure persistence continues even if the session locks or credentials
change. Maintenance and shutdown drain pending sends before closing or replacing the database.
Authority failures never release the durable submission fence or schedule an automatic resend.

An intent is prepared locally, then submitted by its local id. A transaction claims it before
HTTP. Retries with the exact intent return its current record without re-sending, even after
timeout, provider rejection, process crash or application restart. Changed intent parameters
are rejected. Since Cloud has no deduplication guarantee for this send boundary, **unresolved
submission is not retried remotely**. Queued/failed uncertainty may reconcile via the signed
webhook's opaque callback local id; there is no promise of remote exactly-once delivery or
of recovering a message for which Meta never returns a status. Reopening a workspace starts
a separate operation; users should consult the displayed local/provider ids before choosing
a deliberate new send after uncertainty. The read IPC can query a retained local id.

The hosting `business_messaging_status_queue` is independent from `web_orders`. Only account
hash, provider id, status, time, bounded failure code and optional opaque local id survive
parsing; inbound text, recipient ids, names, error text and raw bodies are discarded. Exact
ACK follows local durable writes. Receipt hashes survive ACK, while payloads are cleared.
Duplicates and out-of-order success statuses cannot downgrade read/delivered. A failed
message can recover on later confirmed delivery. Unrelated account/unknown provider ids do
not mutate local entities. Account changes require restoring matching ids to pull older
account statuses. Hosting reset includes this inbox; it does not reset desktop intents.

## Bounds and validation

Graph version is central (`WHATSAPP_GRAPH_API_VERSION`, initially `v25.0`). Requests have
15-second timeout including response reading, disallow redirects, and cap response bytes
at 1 MiB. Pagination uses allowlisted cursor reconstruction, never provider-returned URLs:
100 rows/page, five pages maximum. Catalog has no persisted cache. Only approved templates
appear; text BODY/HEADER numbered or named parameters send. Media/buttons/other components
are visible but marked unsupported. Template create/edit and session messages are absent.
Status HTTP responses cap at 256 KiB; 100 records/page and 20 pages/cycle. Webhook input
caps at 1 MiB/1000 statuses; ACK caps at 100 exact positive sequence ids. Receipts remain
durable; retention policy is an operational follow-up if long-running receipt size warrants it.

Desktop emits `business-messaging.connection.test`, `.template.list`, `.send.started`,
`.send.succeeded`, `.send.failed` and `.webhook.status` via structured diagnostics. Operation
ids correlate local sends; logs never carry phones, customer names, parameters or credentials.

## Verification and references

Portable checks are registered as `business-messaging-provider`, `business-messaging-webhook`,
`business-messaging-hosting` and `business-messaging-ui` in the canonical verification registry.
Provider/secret/network
fixtures exercise actual adapter/service/facade boundaries without Meta traffic. PHP fixtures
exercise signature, sanitize/map, durable inbox and ACK; browser tests use the actual card
and canonical Customer workspace with provider fixtures. Real credentials are not required.

Primary protocol references: [Meta's webhook verification documentation](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/),
[Meta's Cloud template send reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/),
[Meta's Business template API collection](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates).

Run the focused provider/hosting/UI checks plus the required Web, Settings, Customer,
Aras and order regressions with `npm run verify:domain -- business-messaging`. Build
prerequisites remain registry-owned and deduplicated. Run `architecture-audit` separately.
The new desktop tables join the current-schema contract in `db/schema.sql`; no historical
upgrade chain is introduced. An older-schema local database remains incompatible under
the existing repository policy; do not discard its data to enable this integration.
