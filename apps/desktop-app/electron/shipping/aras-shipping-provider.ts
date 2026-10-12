import { ARAS_SHIPPING_PROVIDER, type CommerceShippingProviderAdapter, type CommerceShipmentStatus, type ShippingEnvironment } from "@yardimci-asistan/shared";
import { ArasSoapClient, children, dataRows, field, xmlField, type SoapElement } from "./aras-soap";
import { ShippingProviderError } from "./shipping-provider-error";

export interface ArasCredentials { username: string; password: string; customerCode: string; environment: ShippingEnvironment }

/** Numeric/undocumented states intentionally have no domain meaning. Exact text only. */
export function mapArasShipmentStatus(state: string): CommerceShipmentStatus | null {
  const normalized = state.trim().toUpperCase().replace(/\s+/g, " ");
  const statuses: Record<string, CommerceShipmentStatus> = {
    "TESLİM EDİLDİ": "delivered", "TESLIM EDILDI": "delivered", "DELIVERED": "delivered",
    "TRANSFERDE": "dispatched", "DAĞITIMDA": "dispatched", "DAGITIMDA": "dispatched", "IN TRANSIT": "dispatched"
  };
  return Object.hasOwn(statuses, normalized) ? (statuses[normalized] ?? null) : null;
}
function safeTracking(value: string) {
  return /^[A-Za-z0-9-]{1,100}$/.test(value) ? value : "";
}
function trackingUrl(number: string) {
  // Construct locally; never trust a provider-returned URL.
  return /^\d{8,30}$/.test(number) ? `https://kargotakip.araskargo.com.tr/mainpage.aspx?code=${encodeURIComponent(number)}` : "";
}
function projectedField(row: SoapElement, names: string[]) {
  for (const name of names) { const value = field(row, name); if (value) return value; }
  return "";
}

export class ArasShippingProviderAdapter implements CommerceShippingProviderAdapter {
  readonly providerId = ARAS_SHIPPING_PROVIDER.id;
  private readonly soap: ArasSoapClient;
  constructor(private readonly credentials: ArasCredentials, private readonly authorizeRegistration: () => boolean,
    options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    this.soap = new ArasSoapClient(credentials.environment, options.fetchImpl, options.timeoutMs);
  }
  private auth(usernameField = "userName") {
    return xmlField(usernameField, this.credentials.username) + xmlField("password", this.credentials.password);
  }
  async testConnection() {
    // Nonempty authenticated city lookup plus a harmless cargo query exercises both contracts.
    const cities = dataRows(await this.soap.call("GetCityList", this.auth("username")));
    if (!cities.length || cities.some((row) => projectedField(row, ["Error", "ErrorCode", "HATA", "HATA_KODU"]))) throw new ShippingProviderError("auth_unverified", "Kargo hesabının erişimi doğrulanamadı.");
    await this.getShipmentStatus("YA-CONNECTION-TEST");
  }
  async findShipment(integrationCode: string): Promise<boolean> {
    const result = await this.soap.call("GetOrderWithIntegrationCode", this.auth() + xmlField("integrationCode", integrationCode));
    const orders = children(result, "Order");
    if (!orders.length) {
      if (children(result).length || result.textContent?.trim()) throw new ShippingProviderError("invalid_query", "Kargo kayıt sorgusu doğrulanamadı.");
      return false;
    }
    if (orders.length !== 1) throw new ShippingProviderError("reference_mismatch", "Kargo sağlayıcısı kayıt referansı eşleşmedi.");
    const order = orders[0];
    if (!order || field(order, "IntegrationCode") !== integrationCode) throw new ShippingProviderError("reference_mismatch", "Kargo sağlayıcısı kayıt referansı eşleşmedi.");
    return true;
  }
  async createShipment(input: Parameters<CommerceShippingProviderAdapter["createShipment"]>[0]) {
    if (input.delivery.method !== "shipping") throw new ShippingProviderError("invalid_delivery", "Gönderi için kargo teslimat adresi gerekli.");
    const integrationCode = input.shipment.id;
    if (await this.findShipment(integrationCode)) return { externalReference: integrationCode };
    if (!this.authorizeRegistration()) throw new ShippingProviderError("registration_pending", "Gönderinin sağlayıcı sonucu henüz doğrulanamadı. Aynı gönderiyi tekrar sorgulayın; yeni gönderi oluşturmayın.");
    const address = input.delivery.address;
    const fields: Record<string, string> = {
      UserName: this.credentials.username, Password: this.credentials.password,
      ReceiverName: address.recipientName, ReceiverAddress: [address.addressLine1, address.addressLine2, address.postalCode].filter(Boolean).join(" "),
      ReceiverPhone1: input.receiverPhone, ReceiverCityName: address.city, ReceiverTownName: address.district,
      PieceCount: "1", SpecialField1: input.orderReference, IntegrationCode: integrationCode,
      CountryCode: address.countryCode, IsCod: "0"
    };
    const result = await this.soap.call("SetOrder", `<orderInfo><Order>${Object.entries(fields).map(([name, value]) => xmlField(name, value)).join("")}</Order></orderInfo>${this.auth()}`);
    const rows = children(result, "OrderResultInfo");
    const created = rows[0];
    if (rows.length !== 1 || !created || !field(created, "ResultCode")) throw new ShippingProviderError("invalid_registration", "Kargo kayıt yanıtı doğrulanamadı. Aynı gönderiyi tekrar sorgulayın.");
    // WSDL does not specify ResultCode semantics. A read-back is the success authority.
    if (!await this.findShipment(integrationCode)) throw new ShippingProviderError("registration_pending", "Gönderinin sağlayıcı sonucu henüz doğrulanamadı. Aynı gönderiyi tekrar sorgulayın; yeni gönderi oluşturmayın.");
    return { externalReference: integrationCode };
  }
  async getShipmentStatus(externalReference: string) {
    const result = await this.soap.call("GetCargoInfo", this.auth("username") + xmlField("customerCode", this.credentials.customerCode) + xmlField("integrationCode", externalReference));
    const rows = dataRows(result);
    if (!rows.length) return { status: null, trackingNumber: "", trackingUrl: "" };
    if (rows.length !== 1) throw new ShippingProviderError("ambiguous_status", "Kargo durum yanıtı tek gönderiyle eşleştirilemedi.");
    const row = rows[0];
    if (!row) throw new ShippingProviderError("ambiguous_status", "Kargo durum yanıtı tek gönderiyle eşleştirilemedi.");
    const reference = projectedField(row, ["IntegrationCode", "INTEGRATION_CODE", "INTEGRATIONCODE"]);
    if (reference && reference !== externalReference) throw new ShippingProviderError("reference_mismatch", "Kargo sağlayıcısı kayıt referansı eşleşmedi.");
    if (projectedField(row, ["Error", "ErrorCode", "HATA", "HATA_KODU"])) throw new ShippingProviderError("query_rejected", "Kargo durum sorgusu kabul edilmedi.");
    const number = safeTracking(projectedField(row, ["TrackingNumber", "KARGO_TAKIP_NO", "KARGOTAKIPNO"]));
    return { status: mapArasShipmentStatus(projectedField(row, ["DeliveryStatus", "DURUM", "KARGO_DURUMU"])),
      trackingNumber: number, trackingUrl: trackingUrl(number) };
  }
  async cancelShipment(_externalReference: string): Promise<void> {
    throw new ShippingProviderError("unsupported_operation", "Sağlayıcıda gönderi iptali bu sürümde desteklenmiyor.");
  }
  async getLabel(_externalReference: string): Promise<{ reference: string }> {
    throw new ShippingProviderError("unsupported_operation", "Gönderi etiketi bu sürümde desteklenmiyor.");
  }
}
