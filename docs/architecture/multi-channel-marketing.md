# D5 multi-channel operations

D-039 in the Domain Decision Register owns the behavior. Website and Instagram are
public publishing; WhatsApp and SMS use existing audience campaigns/outbox. All writes
start from explicit user actions in Marketing. AI has no publication/dispatch path.

## Configuration

Enable Marketing Studio and (for WhatsApp/SMS) Messaging Campaigns in business capabilities.
Settings → Services saves each service through the existing category Save/Discard footer.

- Website: existing Web Module URL/sync secret and website publication sync.
- WhatsApp Business: existing WABA/phone ID/token and approved-template campaign flow.
- SMS / İleti Merkezi: API Key, API Hash, approved sender ID and explicit İYS recipient
  list BIREYSEL/TACIR. Enable API access in the provider panel. Test only reads balance and
  sender availability. APITEST is excluded from marketing sends. SMS marketing consent
  is maintained independently in canonical Customer Workspace.
- Instagram: Instagram Login professional account ID and user access token; scopes
  `instagram_business_basic`, `instagram_business_content_publish`. No Facebook Page.
  Manual token renewal uses the same write-only credential ownership as future OAuth.
  API version defaults centrally to v25.0. Profile test does not create media.

Instagram media staging requires an HTTPS Web Module with the new endpoint deployed.
Desktop assets remain local; only a sanitized, bounded JPEG for the selected publication
is uploaded. The provider fetches that expiring URL and the application deletes it after
confirmed publishing. Failed cleanup retains its private local capability for explicit
retry; hosting refuses every public read at expiration even if physical pruning runs later.
A status action on a published record also retries cleanup.

## Hosting staging boundary

Deploy `api/instagram-media.php` and `lib/instagram-staging.php` using existing web
packaging/deployment. Existing `data/.htaccess` denies direct access; non-Apache hosting
must apply the equivalent `/data/` deny rule. PHP executes the endpoint and serves JPEG
bytes itself; no static staging directory, directory index or arbitrary path is public.
Existing authenticated sync secret authorizes upload/delete only, never public GET.

Configure the web server/reverse proxy access logs to exclude the route
`/api/instagram-media.php/*` or redact its final capability path. For example, Apache
VirtualHost configuration can set `SetEnvIf Request_URI "^/[^?]*api/instagram-media\\.php/" instagram_stage`
and apply `env=!instagram_stage` to the existing access CustomLog; nginx can use a
matching location with `access_log off`. Do not enable request-body/header debugging
on this route or provider APIs. The application emits only stable publication IDs and
safe outcome codes, never URLs, capabilities, tokens, API key/hash, phone, full SMS,
caption or raw responses. Upload/delete tokens travel in multipart body, not query.

Expiry is enforced during reads; expired files are also pruned on subsequent uploads.
Desktop records the stage origin, so changing a web installation cannot silently send an
old capability to another host. A failed delete cannot extend lifetime. Staging contains
binary images only and never a canonical asset list or customer data.

## Explicit status / retries

Website retains its existing sync revision acknowledgement. WhatsApp/SMS retain D3
single-flight worker, claim lease, operation-key uniqueness, one BusinessMessage,
transient/rate backoff and pre-POST current Customer/consent validation.

Instagram uses `draft → publishing → published/failed`. Select one image and caption,
preview, then publish. IN_PROGRESS returns to the UI; use Publications → status to
continue when FINISHED. Container ERROR/EXPIRED is terminal; create a new publication
explicitly after reviewing provider state. Published snapshots are immutable locally.
A changed Studio variant never edits an existing social post.

Network ambiguity is not a safe retry signal: create/publish fences survive restart.
Unknown creation never creates again; unknown publish only reads the known container.
PUBLISHED confirms remote acceptance even when no media receipt/permalink was recovered.
If FINISHED persists after an unknown publish, inspect the provider account before
explicitly choosing a new post. Exactly-once remote delivery is not promised.

## Provider sources

Contracts verified against official provider documentation on 2026-10-05:

- [İleti Merkezi JSON overview](https://www.iletimerkezi.com/docs/api)
- [Balance](https://www.iletimerkezi.com/docs/api/get-balance),
  [sender IDs](https://www.iletimerkezi.com/docs/api/get-sender),
  [send](https://www.iletimerkezi.com/docs/api/send-sms),
  [reports](https://www.iletimerkezi.com/docs/api/get-report),
  [error codes](https://www.iletimerkezi.com/docs/api/error-codes).
- [Meta's official Instagram Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api),
  [Instagram Login publishing reference](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/).

## Targeted verification

`npm run verify:domain -- marketing` includes D4/D4.1 regressions plus provider/outbox,
staging and four-channel UI smokes. `npm run verify:domain -- messaging-dispatch` and
`npm run verify:domain -- messaging-campaigns` preserve D1–D3 contracts. Canonical leaf
checks cover PHP lint, Electron types, architecture, registry and web package/deploy.
No default-suite test calls a real SMS/Instagram provider. Full Verify is excluded in D5.
