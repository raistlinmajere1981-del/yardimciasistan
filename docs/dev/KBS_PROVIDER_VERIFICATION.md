# KBS Provider Verification Handoff

This note records the boundary between implemented KBS behavior and the parts that require a real accommodation business account.

## Current product contract

- KBS is available only when accommodation rooms are enabled.
- Local stay mutations always remain authoritative. Provider failures never roll back check-in, checkout, guest departure or room changes.
- Each guest lifecycle event creates a local `hospitality_notifications` record.
- Delivery states:
  - `pending`: recoverable prerequisite, missing identity, login/OTP interaction, or provider binding not yet verified.
  - `failed`: an actual provider delivery attempt failed.
  - `sent`: only a provider-confirmed success or an explicit user action marking an externally completed notification.
- Sent identity snapshots are immutable. Unsatisfied pending snapshots follow customer identity corrections.
- Check-in, checkout, guest departure and room change automatically attempt eligible KBS notifications after the local operation succeeds.
- Manual send remains available from Customer Work > KBS and from active customer rows.

## EGM KBS

Portal: `https://kbs.egm.gov.tr`

Implemented:
- Dedicated persistent Electron partition: `persist:yardimci-kbs-egm`.
- Main-process webview driver.
- Trusted-origin guard: automation runs only on HTTPS EGM domains.
- Semantic login-field detection rather than brittle fixed selectors.
- Stored username / authorized T.C. identity number / password can be applied from main process.
- EGMSEC is treated as an interactive one-time password. No undocumented TOTP secret generation remains in the product.
- After successful user authentication, a notification waiting on login is automatically retried once.

Verified public behavior:
- EGMSEC is the documented second factor for KBS.
- Public PMS browser extensions also automate KBS in the user's authenticated browser session rather than using a documented public KBS API.

Not yet verified:
- Authenticated KBS notification form DOM and success/error markers.
- Exact field mapping for domestic/foreign arrival, departure and room-change forms.
- Whether the current portal changes URLs or frames after authentication.

Real-account verification:
1. Use a disposable test guest; do not use production guest data for selector discovery.
2. Open Customer Work > Kimlik Bildirimleri > EGM Oturumunu Aç.
3. Verify first-factor autofill. If the DOM is not recognized, record labels/names/ids; do not add positional selectors.
4. Enter EGMSEC manually.
5. Capture the authenticated page structure needed for:
   - domestic arrival
   - foreign arrival
   - domestic departure
   - foreign departure
   - room change
6. Implement the final submit driver only after field identity and success/failure markers are observed.
7. A delivery may return `sent` only after the portal visibly confirms success.

Official guide:
- https://m.egm.gov.tr/EGMSEC/KBS-K%C4%B1lavuz.pdf

## Jandarma KBS

Service:
`https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc`

Published service description:
- `?wsdl`
- `?singleWsdl`

Implemented:
- Provider selection from saved KBS settings.
- Facility code, authorized identity number and service password remain main-process secrets.
- Semantic operation selection:
  - `MusteriKimlikNoGiris`
  - `MusteriKimlikNoCikis`
  - `MusteriKimlikNoGuncelle`
  - `MusteriYabanciGiris`
  - `MusteriYabanciCikis`
  - `MusteriYabanciGuncelle`
- Documented domestic arrival fields are modeled without inventing SOAP wire enum values.
- No SOAP action, XML namespace, enum numeric value, or success parser is guessed.

Verified public behavior:
- Access uses authorized person's T.C. identity number, facility code and service password.
- The facility must have web-service permission and an approved source IP.
- Domestic and foreign guests use different operations for arrival, departure and update.
- Public documentation describes parameter metadata retrieval through `ParametreListele`.
- Provider success must be accepted only from the documented success result, never from HTTP 200 alone.

Real-account/WSDL verification:
1. Fetch the raw current WSDL from the machine/network that will run the application.
2. Generate or inspect the WCF contract and record:
   - service namespace
   - SOAP version
   - SOAPAction per operation
   - exact request wrapper names
   - security object shape
   - enum wire values / parameter-list calls
   - response wrapper and result-code fields
3. Confirm the business public IP is authorized.
4. Call a non-mutating metadata/parameter operation first if available.
5. Test one controlled arrival, then exit/update, then foreign flows.
6. Store only the provider reference/result needed for audit; never diagnostic-log guest identity data.

Official service:
- https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc

Official technical guide referenced publicly:
- https://www.jandarma.gov.tr/kurumlar/jandarma.gov.tr/Jandarma/Uygulamalar/KBS/KBS_Tesis_2_WebServis_TD.pdf

## Invariants for future work

- Never mark a queued notification sent merely because a webview opened, credentials were submitted, or an HTTP request returned 2xx.
- Never put KBS passwords, EGMSEC values or guest identity snapshots in structured diagnostics/events.
- Never make local accommodation state depend on provider availability.
- Keep provider-specific DOM/SOAP logic behind `KbsProviderAdapter`.
- Preserve explicit `Haricen Bildirildi` as the recovery path for notifications completed outside Yardımcı Asistan.
