# Shared customer accounts

The common account is controlled by persisted `ONLINE_SALES` (`channel.online_sales`).
Wholesale, the dealer portal setting and an active `customer_commercial_profiles`
row add commercial permission; none bypass Online Sales. Disabling a commercial
profile preserves the normal account and its sessions. Disabling Online Sales
blocks every account/private dealer request immediately after its exact publication
is accepted. Logout and revocation-only logout-all remain available. Records,
credentials and orders are retained. Re-enabling permits the same account to log in.

## Ownership and synchronization

- Hosting `customer_accounts`, provider identities, sessions, email tokens and OAuth
  state are the only identity/credential owners. No provider password is collected.
- Desktop Customer and its existing commercial profile own business identity, dealer
  status and prices. `customer_web_access` is their single opaque account binding.
  The canonical customer insert prepares this binding for ordinary customers too.
- Verified registrations enter the retained `customer_account_registrations` inbox
  while Desktop is offline. `WebSyncIngress` pages it through the existing sync
  transport. `customer-account-ingress` uses the canonical customer writer and commits
  the binding, registration receipt and local cursor atomically. No new publisher or
  Android snapshot workflow exists. Replaying an identity cannot replace its email.
- An email collision, including a deleted customer, becomes an unresolved account.
  Email alone never claims a pre-existing customer, even if verified. Customer
  Workspace presents matching candidates for explicit operator confirmation.
  A linked customer/account cannot be reassigned. No hidden transfer or merge exists.
- The existing `dealer_access` durable aggregate publishes version 3
  `dealer_access_private`, including `online_sales_enabled`, opaque bindings,
  commercial authorization, resolved catalogs and allowlisted own order history.
  It requires `customer_accounts_v1` hosting support. Online Sales changes invalidate
  this aggregate even if there are no customers. Failed/unsupported publication
  retains the durable intent and reports a sync failure. Local saved intent is never
  described as successfully applied remote authorization.
- Customer/account secrets, internal notes, identity documents, financial balances,
  tax data and raw Desktop customer IDs do not enter the account projection.
- Authenticated retail orders carry the server session's account ID. Dealer orders
  carry its current published access ID/revision. Desktop resolves either to the
  canonical Customer inside order creation, applies current prices and rechecks
  permissions. Names, customer IDs, groups and money supplied by clients have no
  authority. Idempotency receipts remain scoped to the authenticated owner.
  Until a customer binding is successfully published, authenticated checkout returns
  `409 customer_link_pending`. Registration and login remain available; a new unique
  customer is linked on the next sync, while collisions require operator confirmation.
  Online Sales pauses retained intake for all order kinds; disabling it alone never
  deletes/rejects an already accepted transport order. Mutable profile display names
  cannot change the fingerprint of an accepted authenticated retry.
- Restore retains Hosting identities/inbox/orders. A newly activated source epoch
  fences old linked account sessions; no historical invitation or compatibility path
  exists. Restored bindings cannot take over an occupied customer/account.

## Authentication and public presentation

`api/account/` exposes config, register, verify, login, session, refresh, logout,
logout-all, recover, reset, profile, orders, OAuth start/callback, browser start and
native exchange. Config is public capability/provider availability only. All private
and identity operations enforce the current Hosting capability. Mutation endpoints
require same-origin JSON and a custom header; explicit foreign origins are rejected.
Passwords use PHP Argon2id; credentials are never sent to Desktop. Verification and
reset tokens are random, hashed, expiring and single use. Activation chooses a new
password using mailbox proof, preventing pre-registration password takeover.
Unverified provider identities are removed on mailbox activation; authenticate the
account and explicitly link that provider afterward. A verified email collision with
an existing account always requires authenticated explicit linking.

Sessions use independent random 256-bit access and refresh credentials, stored as
hashes. HttpOnly, production Secure, SameSite=Lax cookies are scoped to the module
root so account and dealer endpoints share one session. Access lasts 30 minutes;
refresh lasts 30 days. Refresh consumes the old session and rotates both credentials;
recent-authentication time does not advance. Password reset, account logout-all and
Desktop session revision changes invalidate existing sessions. Web and Android logins
create independent rows. Per-address and per-IP hashed attempt counters limit abuse.

Google uses the official authorization-code flow, S256 PKCE and authenticated
UserInfo `sub`; Facebook uses its official confidential code flow, state, app secret
and app-secret proof on UserInfo `id`. Browser-bound, one-use state prevents login
CSRF. Linking additionally requires the same recent existing session at callback.
Tokens are exchanged only with fixed official HTTPS endpoints. They are never
returned to clients, persisted or logged.

Android starts with an exact HTTPS module URL, then normal account login. Social
login opens the system browser through a short-lived server ticket, which establishes
the OAuth cookie in that browser. The callback returns only a one-minute one-use
handoff code to `yardimci-bayi://account`; exchanging it requires the pending device's
S256 verifier. Provider tokens and web sessions never become Android sessions.
Private cached screens require server authorization before first display, revalidate
on resume and poll while visible. Both capability and commercial 403 close those
screens. Normal customers receive an explanation and retain their web accounts.

The API-only module contains no presentation assets. Hosts own their `/hesabim/`
screen; Teknikel keeps its established design and Turkish/English copy. Demo
presentation lives under `test-site/landing/hesabim/`. Unconfigured provider buttons
are absent and email-dependent registration/recovery is unavailable without SMTP.

## External configuration

Configure these as private PHP environment variables, never published business JSON,
client code, source control or command-line logs:

| Variable | Meaning |
| --- | --- |
| `YA_ACCOUNT_SITE_URL` | Exact HTTPS account page, e.g. `https://host/hesabim/` |
| `YA_ACCOUNT_MODULE_URL` | Exact HTTPS module root on the same origin |
| `YA_ACCOUNT_SMTP_HOST`, `YA_ACCOUNT_SMTP_PORT` | Real SMTP host and port |
| `YA_ACCOUNT_SMTP_TLS` | `implicit` for implicit TLS; otherwise verified STARTTLS |
| `YA_ACCOUNT_SMTP_USER`, `YA_ACCOUNT_SMTP_PASSWORD` | SMTP authentication |
| `YA_ACCOUNT_MAIL_FROM` | Verified sender address; configure SPF/DKIM/DMARC with its operator |
| `YA_ACCOUNT_GOOGLE_CLIENT_ID`, `YA_ACCOUNT_GOOGLE_CLIENT_SECRET` | Google web OAuth client |
| `YA_ACCOUNT_FACEBOOK_CLIENT_ID`, `YA_ACCOUNT_FACEBOOK_CLIENT_SECRET` | Meta application credentials |
| `YA_ACCOUNT_FACEBOOK_VERSION` | Supported Graph API version, e.g. `v24.0` |

Both providers must register exactly
`YA_ACCOUNT_MODULE_URL/api/account/callback.php` (one slash). Configure Google consent
screen, domains and release/test users. Configure Meta Facebook Login, valid redirect
URI, app domain, privacy policy/data deletion handling and the provider's required
app review/live mode. Configure any provider-mandated deletion callback before a
public launch. PHP needs PDO SQLite, Argon2id support, cURL, mbstring and a current CA
store. SMTP uses verified TLS only; there is no production plaintext, token-return,
file-mailbox or PHP mail fallback. Protect `data/`/config with packaged access rules.
Exclude callback query strings from HTTP access logs; authorization codes and state
must not enter proxy/server analytics or diagnostic collection.

## Verification limits

`customer-accounts`, `commerce-dealer-access`, `commerce-dealer-orders`,
`web-dealer-portal`, existing application/customer workspace checks and Android JVM,
build/lint checks are registered with the canonical verifier. The native Java API client
is tested against real local PHP/SQLite through an independently trusted TLS proxy.
The physical device also exercises that real local API through a temporary ADB TLS
connection: login/refresh, independent logout, Desktop dealer grant/prices/order retry,
demotion, Online Sales disable/enable and revocation. Its separate UI/media fixture
explicitly supplies synthetic authorization and data. Account tests use real
local PHP/HTTP/SQLite and a real local verified-TLS SMTP protocol fixture. OAuth
state, PKCE and linking tests inject explicit provider responses at the service
boundary; they do not prove real Google/Meta credentials, consent/app approval or
mail delivery to external inboxes. HTTPS Hosting, Android browser deep-link behavior
on a physical device and real provider/SMTP configuration remain live manual checks.
