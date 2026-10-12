import { DOMParser } from "@xmldom/xmldom";
import type { ShippingEnvironment } from "@yardimci-asistan/shared";
import { ShippingProviderError } from "./shipping-provider-error";

const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
export const ARAS_SERVICE_NS = "http://tempuri.org/";
const ENDPOINTS: Record<ShippingEnvironment, string> = {
  test: "https://customerservicestest.araskargo.com.tr/arascargoservice/arascargoservice.asmx",
  production: "https://customerws.araskargo.com.tr/arascargoservice.asmx"
};
const MAX_RESPONSE_BYTES = 512 * 1024;
export type SoapElement = NonNullable<ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>["documentElement"]>;
export function xmlText(value: string) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new ShippingProviderError("invalid_input", "Kargo alanlarında geçersiz karakter var.");
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
export function xmlField(name: string, value: string) { return `<${name}>${xmlText(value)}</${name}>`; }
export function children(element: SoapElement, name?: string, namespace?: string): SoapElement[] {
  const result: SoapElement[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) {
      const child = node as SoapElement;
      if ((!name || child.localName === name) && (!namespace || child.namespaceURI === namespace)) result.push(child);
    }
  }
  return result;
}
export function field(element: SoapElement, name: string): string {
  const matches = children(element, name);
  if (matches.length > 1 || (matches[0] && children(matches[0]).length)) throw malformed();
  return matches[0]?.textContent?.trim() ?? "";
}
function malformed() { return new ShippingProviderError("malformed_xml", "Kargo sağlayıcısının yanıtı doğrulanamadı."); }

export function parseSoapResult(xml: string, operation: string): SoapElement {
  if (Buffer.byteLength(xml, "utf8") > MAX_RESPONSE_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw malformed();
  try {
    let invalid = false;
    const document = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(xml, "text/xml");
    const root = document.documentElement;
    if (invalid || root?.localName !== "Envelope" || root.namespaceURI !== SOAP_NS) throw malformed();
    let nodes = 0;
    const inspect = (element: SoapElement, depth: number) => {
      if (++nodes > 10000 || depth > 40) throw malformed();
      for (const child of children(element)) inspect(child, depth + 1);
    };
    inspect(root, 0);
    const bodies = children(root, "Body", SOAP_NS);
    if (bodies.length !== 1) throw malformed();
    const body = bodies[0];
    if (!body) throw malformed();
    if (children(body, "Fault", SOAP_NS).length) throw new ShippingProviderError("soap_fault", "Kargo sağlayıcısı isteği kabul etmedi. Hesap ve servis yetkilerini kontrol edin.");
    const responses = children(body, `${operation}Response`, ARAS_SERVICE_NS);
    if (responses.length !== 1 || children(body).length !== 1) throw malformed();
    const response = responses[0];
    if (!response) throw malformed();
    const results = children(response, `${operation}Result`, ARAS_SERVICE_NS);
    if (results.length !== 1) throw malformed();
    const result = results[0];
    if (!result) throw malformed();
    return result;
  } catch (error) { if (error instanceof ShippingProviderError) throw error; throw malformed(); }
}

/** DataTable projection ignores xsd declarations, diffgram before/errors and arbitrary metadata. */
export function dataRows(result: SoapElement): SoapElement[] {
  const diffgrams = children(result, "diffgram", "urn:schemas-microsoft-com:xml-diffgram-v1");
  if (diffgrams.length !== 1) throw malformed();
  const diffgram = diffgrams[0];
  if (!diffgram) throw malformed();
  if (children(diffgram, "errors", "urn:schemas-microsoft-com:xml-diffgram-v1").length) throw new ShippingProviderError("query_rejected", "Kargo sorgu yanıtında veri hatası var.");
  const tables = children(diffgram).filter((node) => node.namespaceURI !== "urn:schemas-microsoft-com:xml-diffgram-v1");
  if (tables.length > 1) throw malformed();
  const table = tables[0];
  return table ? children(table) : [];
}

export class ArasSoapClient {
  constructor(private readonly environment: ShippingEnvironment, private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 15000) {}
  async call(operation: string, fields: string): Promise<SoapElement> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let httpStatus: number | undefined;
    try {
      const response = await this.fetchImpl(ENDPOINTS[this.environment], { method: "POST", redirect: "error",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${ARAS_SERVICE_NS}${operation}"` },
        body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Body><${operation} xmlns="${ARAS_SERVICE_NS}">${fields}</${operation}></soap:Body></soap:Envelope>`,
        signal: controller.signal });
      httpStatus = response.status;
      if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
        await response.body?.cancel(); throw new ShippingProviderError("response_too_large", "Kargo sağlayıcısının yanıtı boyut sınırını aştı.", httpStatus);
      }
      if (!response.body) throw malformed();
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new ShippingProviderError("response_too_large", "Kargo sağlayıcısının yanıtı boyut sınırını aştı.", httpStatus); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      if (!response.ok) {
        // A SOAP fault body may contain credentials/PII; expose only a fixed normalized error.
        try { parseSoapResult(xml, operation); } catch (error) { if (error instanceof ShippingProviderError && error.code === "soap_fault") throw new ShippingProviderError(error.code, error.message, httpStatus); }
        throw new ShippingProviderError("http_error", "Kargo sağlayıcısına erişilemedi.", httpStatus);
      }
      return parseSoapResult(xml, operation);
    } catch (error) {
      if (error instanceof ShippingProviderError) throw error;
      if (controller.signal.aborted) throw new ShippingProviderError("timeout", "Kargo sağlayıcısı zamanında yanıt vermedi.", httpStatus);
      throw new ShippingProviderError("network_error", "Kargo sağlayıcısına bağlantı kurulamadı.", httpStatus);
    } finally { clearTimeout(timer); }
  }
}
