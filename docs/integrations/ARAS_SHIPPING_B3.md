# Aras shipping B3

This is a local desktop adapter. Aras contract was checked against both official WSDLs
on 2026-10-04; no credentialed network operation was performed during development.

Official boundaries (main process only):

- Test: https://customerservicestest.araskargo.com.tr/arascargoservice/arascargoservice.asmx?WSDL
- Production: https://customerws.araskargo.com.tr/arascargoservice.asmx?WSDL
- SOAP namespace: `http://tempuri.org/`; transport is SOAP 1.1 over HTTPS.

Implemented operations:

- `GetCityList(username, password)` plus a harmless `GetCargoInfo` query: connection test.
  Empty city responses fail closed; merely reaching the host is not reported as success.
- `GetOrderWithIntegrationCode(userName, password, integrationCode)`: reconciliation.
- `SetOrder(orderInfo, userName, password)`: one `Order` with canonical shipment id as
  IntegrationCode. Registration is confirmed by a matching read-back; ResultCode alone
  is not success evidence. No label or dispatch operation is invoked.
- `GetCargoInfo(username, password, customerCode, integrationCode)`: manual tracking/status.

Public WSDL specifies open DataTable XML for GetCargoInfo, without a closed field/status
code dictionary. Current projection understands `IntegrationCode` / `INTEGRATION_CODE` /
`INTEGRATIONCODE`, `TrackingNumber` / `KARGO_TAKIP_NO` / `KARGOTAKIPNO`, and `DeliveryStatus` /
`DURUM` / `KARGO_DURUMU`. A different live-account schema remains unknown rather than
inventing tracking or advancing lifecycle. Fixture tests cover these shapes; verify a
sanitized account-specific response with Aras before extending the projection.

Exact status descriptions:

| Description | Internal result |
| --- | --- |
| TESLİM EDİLDİ / TESLIM EDILDI / DELIVERED | delivered |
| TRANSFERDE / DAĞITIMDA / DAGITIMDA / IN TRANSIT | dispatched |
| Other, numeric, empty, preparation, failed delivery, return | unchanged |

Sender account ownership is authenticated by provider credentials. Receiver phone uses
buyerSnapshot.phone, never a later Customer edit. First slice sends one domestic parcel
without invented weight/desi or price. Provider-required account-specific fields must be
confirmed with Aras; a rejected/ambiguous registration is reconciled, never blindly resent.

Configure through Settings → Services → Aras Kargo and save the category. New passwords
are encrypted in main; old passwords are retained when the write-only input is blank,
and removed only by explicit clear. Connection test may use an unsaved draft and never
saves it. No default tests use the real network. No credentials belong in the repository.
