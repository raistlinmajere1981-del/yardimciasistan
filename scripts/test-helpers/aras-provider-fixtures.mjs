import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const compiledRequire = createRequire(new URL("../../apps/desktop-app/dist-electron/shipping-provider-service.js", import.meta.url));
export const testCredentials = { username: "fixture-user", password: "fixture-password-only", customerCode: "fixture-account", environment: "test" };
export function soap(operation, body) {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation}Response xmlns="http://tempuri.org/"><${operation}Result>${body}</${operation}Result></${operation}Response></soap:Body></soap:Envelope>`;
}
export function dataTable(operation, row = "") {
  return soap(operation, `<diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">${row ? `<DocumentElement><Row>${row}</Row></DocumentElement>` : ""}</diffgr:diffgram>`);
}
export function orderResponse(id, found = true) {
  return soap("GetOrderWithIntegrationCode", found ? `<Order><IntegrationCode>${id}</IntegrationCode></Order>` : "");
}
export function fixtureHttp() {
  const calls = [];
  const registered = new Set();
  const state = { status: "", trackingNumber: "1234567890123", failSet: false, lostSet: false, pendingSet: false, failQuery: false, delaySet: null, malformed: false };
  const fetchImpl = async (url, options) => {
    const operation = options.headers.SOAPAction.match(/\/([^/]+)"$/)[1];
    const id = options.body.match(/<(?:integrationCode|IntegrationCode)>([^<]*)<\//)?.[1] ?? "";
    calls.push({ url: String(url), operation, body: options.body, id });
    if (state.malformed) return new Response("<invalid");
    if (state.failQuery && operation !== "SetOrder") throw new Error("network fixture recipient-secret");
    if (operation === "GetCityList") return new Response(dataTable(operation, "<CityName>Fixture City</CityName>"));
    if (operation === "GetOrderWithIntegrationCode") return new Response(orderResponse(id, registered.has(id)));
    if (operation === "SetOrder") {
      if (state.delaySet) await state.delaySet;
      if (state.failSet) throw new Error("network fixture-password-only receiver-secret");
      if (!state.pendingSet) registered.add(id);
      if (state.lostSet) throw new Error("Lost remote response contains receiver-secret");
      return new Response(soap(operation, "<OrderResultInfo><ResultCode>UNSPECIFIED_SUCCESS_CODE</ResultCode><InvoiceKey>fixture-invoice</InvoiceKey></OrderResultInfo>"));
    }
    if (operation === "GetCargoInfo") return new Response(dataTable(operation, id === "YA-CONNECTION-TEST" ? "" :
      `<IntegrationCode>${id}</IntegrationCode><TrackingNumber>${state.trackingNumber}</TrackingNumber><DeliveryStatus>${state.status}</DeliveryStatus>`));
    throw new Error(`Unexpected operation: ${operation}`);
  };
  return { calls, registered, state, fetchImpl };
}
export function fixtureSecretService() {
  let available = true, backend = "gnome_libsecret";
  const exports = {};
  runInNewContext(readFileSync(new URL("../../apps/desktop-app/dist-electron/shipping-secret-service.js", import.meta.url), "utf8"), {
    exports, Buffer, process: { platform: "linux" }, Error,
    require: () => ({ safeStorage: {
      isEncryptionAvailable: () => available, getSelectedStorageBackend: () => backend,
      encryptString: (value) => Buffer.from(`cipher-fixture:${value}`),
      decryptString: (value) => { const text = value.toString(); if (!text.startsWith("cipher-fixture:")) throw new Error("bad cipher"); return text.slice(15); }
    } })
  });
  return { ...exports, setAvailable: (value) => { available = value; }, setBackend: (value) => { backend = value; } };
}
export function fixtureShippingService(getDatabase, http, secrets, logs = []) {
  const exports = {};
  runInNewContext(readFileSync(new URL("../../apps/desktop-app/dist-electron/shipping-provider-service.js", import.meta.url), "utf8"), {
    exports, Error,
    require: (name) => {
      if (name === "./shipping-secret-service") return secrets;
      if (name === "./desktop-logger") return { createDiagnosticOperationId: () => "fixture-operation", desktopLog: {
        info: (event) => logs.push(event), warn: (event) => logs.push(event), error: (event) => logs.push(event)
      } };
      return compiledRequire(name);
    }
  });
  return new exports.ShippingProviderService(getDatabase, { fetchImpl: http.fetchImpl, timeoutMs: 100 });
}
