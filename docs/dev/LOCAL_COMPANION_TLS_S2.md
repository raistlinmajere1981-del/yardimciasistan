# Local Companion TLS S2

S2 implements QR trust and Android pinned HTTPS. **Product HTTPS is not enabled.**
`main.ts` still constructs the existing HTTP listener; the S1 HTTPS option remains
an experiment. The trusted pairing IPC refuses to open a session without the
active listener's public TLS identity and a private IPv4 HTTPS endpoint. The UI
explains that secure pairing is not yet available, and displays no unusable QR.
There are no new user settings, Web credentials, ADB or root requirements.

## QR and trusted display

The exact byte-mode format is:

```
yapair3|<desktopId>|<credential-base64url>|<IPv4:port>|<SPKI-SHA256-base64url>
```

The Desktop ID matches `desktop-[A-Za-z0-9._:-]{8,120}`. The credential encodes the
32 bytes from the existing CSPRNG-generated, single-use `yald1.<64 hex>` session.
Both binary values have exactly 43 unpadded, canonical base64url characters.
The IPv4 address must be canonical RFC1918 (10/8, 172.16/12, 192.168/16), with an
explicit canonical decimal port 1..65535. No DNS, public IP, IPv6, path, userinfo,
query, scheme override or redirect target is accepted. The client supplies HTTPS.
Android rejects v1/v2, malformed encodings and absent pins. No migration exists.

`main.ts` projects only the SPKI pin from `LocalCompanionServer.tlsIdentity` plus
an endpoint whose IP is in that identity's SAN set. The existing trusted-frame,
unlocked, Android-capability and saved-LAN IPC gates remain. No key is exposed,
and a pin is never learned from `/status` or discovery. S2 does not manufacture a
separate identity solely to draw a QR while an HTTP server is running.

No installed QR encoder was available. `secure-pairing-qr-code.ts` is a pairing-only
Model 2 version 10-L encoder (274 data codewords; blocks 68/68/69/69, 18 ECC bytes
per block, version BCH metadata, byte mode with 16-bit length, mask 0). It accepts
271 bytes, including the longest permitted Desktop ID. The menu's version 6
encoder stays unchanged. The QR smoke independently decodes the rendered SVG's
modules with installed ZBar at the actual 240px display width and 520px, for both
normal and maximum IDs. ZBar is a verification-host tool, not a product dependency.
Physical camera scanning still requires a device check.

## Android trust and transport

`LocalPinnedHttps` is shared by status, pairing, summaries, actions and discovery
address refreshes. Each connection gets its own TLS 1.2 context and trust manager.
The trust manager verifies the leaf SPKI SHA-256 with `MessageDigest.isEqual`,
certificate time validity, CA=false, self-issued name and self-signature,
digitalSignature key usage, serverAuth EKU, and exact target IP SAN. A single
self-signed leaf is required. The hostname verifier enforces the same policy;
there is no CN/DNS fallback, default/system-CA trust, trust-all manager or SSL
exception recovery to HTTP. Redirects and non-HTTPS injected connections fail.

Request headers and streaming mode are configured before `connect()` as required
by HttpsURLConnection. The trust manager authenticates during the handshake,
before HTTP headers can be sent. An explicit peer-certificate check after connect
also protects resumed sessions and test factories, before output/response access.
Pairing authenticates `/pair` independently after the status probe. No pairing
credential or long-lived token is sent on an unauthenticated connection.

ConnectionSettings commits Desktop ID, endpoint, target, token and pin together;
readers consume one SharedPreferences snapshot. Missing pin requires a fresh QR.
The operations transport reads persisted identity on every request and rejects
stale Desktop/token/pin/target/endpoint combinations. TLS failures do not authorize
Hosting fallback, invalidate pending actions, or erase credentials/trust.

Discovery proposes HTTPS addresses only. A worker validates the stored pin, SAN
and matching status Desktop ID before persisting an endpoint; discovery cannot
create pairing trust. The QR path uses its own endpoint directly and never
replaces the current reconnect address before authentication succeeds.

Existing device approval, permissions, revocation and durable action/receipt owners
remain. Target fences run before network I/O and again before trust replacement.
A pin change with any queued action or unresolved receipt is rejected; IDs,
payloads, ordering, previous trust and receipts remain. Re-pairing with the same
pin (including certificate renewal) can preserve those pending operations.
An action whose response is lost stays pending with its existing idempotency ID.

## Focused verification in this workspace

PASS:

- Desktop TypeScript, Electron compilation, and file-scoped ESLint.
- `node scripts/smoke-local-pairing-qr.mjs`, including independent ZBar decoding.
- `node scripts/smoke-local-companion-tls.mjs --contracts-only`.
- `node scripts/smoke-local-companion-server.mjs --contracts-only`, including the
  HTTP-listener pairing gate, approval/revocation and trusted IPC contracts.
- Direct Java 8 source/target compilation of the changed Android sources using the
  installed SDK and cached dependencies. This is not Gradle/APK verification.
- Focused JUnit classes: AndroidLocalOnboardingTest, LocalPinnedHttpsTest and
  AndroidCompanionStorageTest, plus AndroidOperationsTransportSmoke. They use real
  S1-generated public certificates and injected HTTPS I/O, not a TLS bypass.
- `git diff --check`.

Environment-blocked:

- Gradle `testDebugUnitTest` could not initialize native services/load
  `libnative-platform.so`. It was not retried in a loop.
- Real listener TLS smoke reached `listen EPERM` on 127.0.0.1. Contracts passed;
  network TLS was not proved. No socket retry loop was used.

Run on a normal host before product cutover:

```sh
node scripts/run-android-gradle.mjs testDebugUnitTest --tests com.yardimciasistan.android.AndroidLocalOnboardingTest --tests com.yardimciasistan.android.LocalPinnedHttpsTest --tests com.yardimciasistan.android.AndroidCompanionStorageTest --offline
node scripts/smoke-local-companion-tls.mjs
node scripts/smoke-local-companion-server.mjs
```

The certificate fixture README records validity dates; never weaken production
validity validation to preserve a stale test fixture. No pre-main/full/release,
APK packaging, app/service restart, commit, push, deploy or data cleanup was run.

## S3 remains

Coordinate the one product listener's HTTPS startup using the S1 identity owner,
certificate refresh on interface changes, HTTPS discovery advertisement and
shutdown/error behavior. Open QR issuance only against that running identity.
Retire plaintext credential/operation endpoints without parallel operational
HTTP/HTTPS listeners or downgrade. Preserve all outbox/receipt fences.

Normal-host Gradle and socket tests, Android/Conscrypt TLS handshake checks, and
physical USB-tether/Wi-Fi QR pairing, approval, reconnect/DHCP, renewal, rejection
and offline replay are still required. S2's injected-I/O JVM evidence does not
prove those device/network behaviors. Broader integration gates remain with the
user under AGENTS.md after the coordinated S3 work.
