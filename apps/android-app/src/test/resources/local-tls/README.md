These are PUBLIC certificate fixtures, generated with the S1
LocalCompanionTlsIdentity owner. There are no private keys here. The temporary
fixture identities and keys were discarded after certificate generation.

leaf.pem is the actual S1 profile. renewed.pem uses the same key with a changed
SAN set; wrong-san.pem also uses the same key. wrong-key.pem is another install.
expired/future/ca/no-eku are re-signed variants for rejection tests.

The normal certificates are valid 2026-10-26 through 2027-10-27. Refresh these
public fixtures with the S1 owner before expiry; keep production validity checks
in force. Expired/future certificate rejection is intentional in those fixtures.
The JVM tests use real X.509 verification; injected HTTPS connections only replace
network I/O. Real Android/Conscrypt handshakes still require host/device checks.
