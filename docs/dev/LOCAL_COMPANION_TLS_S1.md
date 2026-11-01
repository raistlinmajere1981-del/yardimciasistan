# Local Companion TLS — S1 experiment

S1 introduces a main-process identity owner and a test-only HTTPS boundary. The
current product startup, pairing QR, discovery and Android transport still use
their existing HTTP flow. Do not enable this experiment for customer operations
until S2 pin verification and S3 coordinated cutover are complete. No running
application needs to be restarted to validate the source changes.

## Startup and ownership

`LocalCompanionTlsIdentity` accepts Electron's `app.getPath("userData")` and
`safeStorage` **after app readiness**. Its serialized `load()` owns key creation,
decryption, certificate validation and same-key renewal. It neither imports the
Electron runtime nor opens sockets. Production callers must supply real Electron
safeStorage; the smoke uses authenticated AES-GCM mock storage only.

The explicit test flag is the constructor option
`httpsExperiment: { enabled: true, identity }` on `LocalCompanionServer`.
It is deliberately not wired into `main.ts`, environment variables, settings,
mDNS or the HTTP QR issuer during S1. An absent option preserves the current HTTP
behavior and performs no TLS identity I/O. An invalid option, identity error or
TLS startup failure rejects startup; it cannot select an HTTP fallback. Only one
operational listener is created, including concurrent start calls. Existing
authorization and mutation owners handle all four endpoints in either mode.

An isolated main-process test harness can construct it after readiness:

```ts
const identity = new LocalCompanionTlsIdentity({
  userDataPath: app.getPath("userData"),
  safeStorage
});
const server = new LocalCompanionServer({
  ...existingCompanionOptions,
  httpsExperiment: { enabled: true, identity }
});
await server.start("127.0.0.1", 0);
```

TLS requires at least TLS 1.2. `identity.publicIdentity()` and `server.tlsIdentity`
expose only certificate, IP addresses and the unpadded base64url SHA-256 hash of
DER SubjectPublicKeyInfo. They never expose the key. Future QR must carry this
pin from the trusted display; discovery and `/status` cannot establish trust.

## Cryptography and storage

- One generated ECDSA P-256 key per per-user installation, with Node WebCrypto.
- Self-signed SHA-256 X.509 v3 leaf: critical CA=false and digitalSignature-only
  key usage, serverAuth EKU, binary IP SANs for current IPv4/IPv6 interfaces.
  IPv6 scope IDs are excluded from SANs. No DNS SAN or identity inferred from CN.
- Certificate lifetime is 365 days, backdated one day. Renew within 30 days of
  expiry or when the interface address set changes, using the same private key.
  Call `server.refreshTlsIdentity()` from future interface/runtime reconciliation
  to replace the TLS context for subsequent connections. No timer is added in S1.
- The entire versioned PKCS#8 PEM/certificate/address record is encrypted by
  safeStorage in `<userData>/local-companion-tls/identity.enc`, outside business
  backup/restore data. No bundled key, external OpenSSL process, CA installation,
  cloud service, Web configuration, elevation or OS trust prompt is used.
- Atomic same-directory temporary file, file fsync, rename, and POSIX directory
  fsync; POSIX directory/file permissions are 0700/0600. Windows uses normal-user
  userData permissions and safeStorage DPAPI; no ACL/system-CA modification.
- Linux encryption unavailable, `basic_text` or `unknown` backend fails closed.
  Existing missing, malformed, undecryptable, mismatched or symlinked identities
  fail closed and are preserved. No automatic reset or key rotation. Even an
  interrupted first creation leaving an empty identity directory requires explicit
  recovery. Replacing a key requires explicit re-pairing in the future protocol.
- Backward clock changes beyond certificate validity fail closed. Forward clock
  changes can trigger renewal. Accurate client/server clocks remain necessary.
  safeStorage does not protect against malware running as the same OS user.

## Dependencies and import review

Direct runtime dependencies are exact-pinned **pkijs 3.4.1** and **asn1js 3.0.10**,
already present in the lockfile. Their existing dependency graph is promoted
from development to production; no versions or integrity hashes change.
PKI.js's package `main` resolves to `build/index.js` (CommonJS); ASN1.js's resolves
to `build/index.js`. The compiled Electron CommonJS smoke imports both and uses
an explicit Node WebCrypto engine without changing a global crypto provider.

This uses Peculiar Ventures' existing X.509 implementation, following its
[certificate creation API](https://pkijs.org/docs/examples/certificates-and-revocation/create-and-validate-certificate/).
`@peculiar/x509` was considered, but npm DNS access was unavailable in this
sandbox and it was not installed/cached. This avoids introducing an unverified
ESM import path or vendoring a certificate implementation. Review here covers
the used API, installed package metadata/imports and generated certificate
profile; it is not a new third-party security audit.

## Narrow verification

Compile Electron with `node_modules/.bin/tsc -p apps/desktop-app/tsconfig.electron.json`.
Then run the registered smoke directly:

```sh
node scripts/smoke-local-companion-tls.mjs --contracts-only
node scripts/smoke-local-companion-server.mjs --contracts-only
```

On a host permitting loopback sockets, run both without `--contracts-only`.
The TLS smoke performs real HTTPS requests and rejects wrong trust certificate,
wrong SPKI pin, wrong IP SAN and plaintext operations; it also tests live context
renewal. `EPERM` binding a socket is an environment limitation, not a handshake
pass. Contracts-only does not prove network TLS. Physical Windows DPAPI,
normal-user packaging and phone behavior require later host/device validation.
No full suite, release packaging or application launch is required for S1.

## Next stages

S2 adds QR/bootstrap SPKI trust and a shared pinned Android TLS transport before
credentials are sent, including certificate/SAN/time validation, no TLS-error
fallback, and durable queue identity/reconciliation. Initial customer pairing
must work over LAN via USB tether or Wi-Fi without ADB, USB debugging or root.
ADB is permitted only for developer phone testing; those tests must not depend
on USB tethering.

S3 coordinates product HTTPS startup, QR/discovery/endpoint scheme, interface
renewal, and retirement of HTTP-exposed credentials while preserving pending
operations. It must not run simultaneous operational HTTP/HTTPS listeners or
silently downgrade. Current HTTP remains unchanged until that coordinated switch.
