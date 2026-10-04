import { createHash } from "node:crypto";
import { ARAS_SHIPPING_PROVIDER, type ArasShippingConfigurationInput, type ShippingConnectionTestResult } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import { assertPersistedBusinessCapability } from "./business-capability-runtime";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { normalizeArasShippingInput } from "./shipping-configuration-store";
import { decryptShippingSecret } from "./shipping-secret-service";
import { ArasShippingProviderAdapter, type ArasCredentials } from "./shipping/aras-shipping-provider";
import { normalizeShippingProviderError, ShippingProviderError } from "./shipping/shipping-provider-error";

/** One runtime service, built in main. No polling, runtime provider discovery or remote auto-retries. */
export class ShippingProviderService {
  private readonly activeShipments = new Set<string>();
  constructor(private readonly getDatabase: () => DesktopDatabase,
    private readonly httpOptions: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}
  getConfiguration() {
    const db = this.getDatabase();
    const config = db.getArasShippingConfiguration();
    return { ...config, configured: config.configured && Boolean(decryptShippingSecret(db.getEncryptedShippingPassword())) };
  }
  private credentials(input?: ArasShippingConfigurationInput): ArasCredentials {
    const db = this.getDatabase();
    const stored = db.getArasShippingConfiguration();
    const config = input ? normalizeArasShippingInput(input) : stored;
    const password = input?.password || (input?.clearPassword ? "" : decryptShippingSecret(db.getEncryptedShippingPassword()));
    if (!config.enabled || !config.username || !config.customerCode || !password) throw new ShippingProviderError("unconfigured", "Kargo sağlayıcısı yapılandırılmamış. Servisler ayarlarını tamamlayın.");
    return { environment: config.environment, username: config.username, customerCode: config.customerCode, password };
  }
  async testConnection(input?: ArasShippingConfigurationInput): Promise<ShippingConnectionTestResult> {
    const operationId = createDiagnosticOperationId("shipping-test");
    let result: ShippingConnectionTestResult;
    try {
      const adapter = new ArasShippingProviderAdapter(this.credentials(input), () => false, this.httpOptions);
      await adapter.testConnection();
      result = { ok: true, providerId: ARAS_SHIPPING_PROVIDER.id, message: "Kargo hesabının bağlantısı ve sorgu yanıtları doğrulandı.", testedAt: new Date().toISOString() };
    } catch (caught) {
      const error = normalizeShippingProviderError(caught);
      result = { ok: false, providerId: ARAS_SHIPPING_PROVIDER.id, message: error.message, testedAt: new Date().toISOString() };
    }
    desktopLog[result.ok ? "info" : "warn"]({ scope: "shipping", event: "shipping.provider.connection.test",
      message: result.message, operationId, meta: { providerId: result.providerId, ok: result.ok } });
    return result;
  }
  private accountFingerprint(credentials: ArasCredentials) {
    return createHash("sha256").update(JSON.stringify([credentials.environment, credentials.customerCode, credentials.username])).digest("hex");
  }
  private async operation(shipmentId: string, action: "create" | "status.refresh") {
    if (typeof shipmentId !== "string" || !/^commerce_shipment_[A-Za-z0-9_-]{1,100}$/.test(shipmentId)) {
      throw new ShippingProviderError("invalid_shipment", "Gönderi kimliği geçersiz.");
    }
    const db = this.getDatabase();
    assertPersistedBusinessCapability(db.databasePath, BUSINESS_CAPABILITIES.ORDERS, "Sipariş yönetimi bu işletmede etkin değil.");
    if (this.activeShipments.has(shipmentId)) throw new ShippingProviderError("operation_busy", "Bu gönderi için sağlayıcı işlemi sürüyor.");
    this.activeShipments.add(shipmentId);
    const operationId = createDiagnosticOperationId("shipping");
    const meta = { providerId: ARAS_SHIPPING_PROVIDER.id, shipmentId };
    desktopLog.info({ scope: "shipping", event: `shipping.provider.${action}.started`, message: "Kargo sağlayıcı işlemi başlatıldı.", operationId, meta });
    try {
      const shipment = db.getShipment(shipmentId);
      if (!shipment) throw new ShippingProviderError("missing_shipment", "Gönderi bulunamadı.");
      const detail = db.getCommerceOrder(shipment.orderId);
      if (!detail || detail.order.deliverySnapshot.method !== "shipping") throw new ShippingProviderError("invalid_delivery", "Gönderi için kargo teslimat adresi gerekli.");
      const credentials = this.credentials();
      const accountFingerprint = this.accountFingerprint(credentials);
      const existing = db.getShipmentRegistration(shipmentId);
      if (existing && (existing.providerId !== ARAS_SHIPPING_PROVIDER.id || existing.accountFingerprint !== accountFingerprint)) {
        throw new ShippingProviderError("account_changed", "Gönderinin kayıtlı sağlayıcı hesabı veya ortamı değişmiş. Kayıt sırasında kullanılan ayarları geri yükleyin.");
      }
      if (action === "create" && shipment.externalReference) {
        if (shipment.providerId !== ARAS_SHIPPING_PROVIDER.id) throw new ShippingProviderError("provider_changed", "Gönderinin sağlayıcı bağlantısı değiştirilemez.");
        return shipment;
      }
      if (action === "create" && (!["draft", "ready"].includes(shipment.status) || detail.order.status === "cancelled")) {
        throw new ShippingProviderError("invalid_lifecycle", "Yalnız iptal edilmemiş siparişin taslak veya hazır gönderisi kaydedilebilir.");
      }
      if (action === "status.refresh" && (!existing || shipment.providerId !== ARAS_SHIPPING_PROVIDER.id)) {
        throw new ShippingProviderError("not_registered", "Gönderi sağlayıcıya kayıtlı değil.");
      }
      const adapter = new ArasShippingProviderAdapter(credentials, () => db.markShipmentRegistrationSubmitted(shipmentId), this.httpOptions);
      if (action === "create") {
        const phone = detail.order.buyerSnapshot?.phone?.trim() || "";
        if (!phone) throw new ShippingProviderError("missing_phone", "Kargo kaydı için sipariş iletişim snapshot'ında telefon gerekli.");
        if (detail.order.deliverySnapshot.address.countryCode !== "TR") throw new ShippingProviderError("unsupported_country", "Bu sağlayıcı akışı yalnız Türkiye içi gönderileri destekliyor.");
        const reserved = db.prepareShipmentRegistration({ shipmentId, providerId: ARAS_SHIPPING_PROVIDER.id, integrationCode: shipment.id, accountFingerprint });
        if (reserved.accountFingerprint !== accountFingerprint || reserved.providerId !== ARAS_SHIPPING_PROVIDER.id) {
          throw new ShippingProviderError("account_changed", "Gönderinin kayıtlı sağlayıcı hesabı veya ortamı değişmiş.");
        }
        const registration = await adapter.createShipment({ shipment, delivery: detail.order.deliverySnapshot, receiverPhone: phone,
          orderReference: detail.order.sourceReference || detail.order.id });
        const updated = db.applyShipmentProviderResult({ shipmentId, providerId: ARAS_SHIPPING_PROVIDER.id,
          providerName: ARAS_SHIPPING_PROVIDER.name, externalReference: registration.externalReference, accountFingerprint });
        desktopLog.info({ scope: "shipping", event: "shipping.provider.create.succeeded", message: "Kargo sağlayıcı kaydı doğrulandı.", operationId, meta });
        return updated;
      }
      const status = await adapter.getShipmentStatus(shipment.externalReference);
      if (status.status === null) desktopLog.warn({ scope: "shipping", event: "shipping.provider.status.unknown",
        message: "Sağlayıcı durumu eşlenemedi; gönderi durumu korunuyor.", operationId, meta });
      const updated = db.applyShipmentProviderResult({ shipmentId, providerId: ARAS_SHIPPING_PROVIDER.id,
        providerName: ARAS_SHIPPING_PROVIDER.name, externalReference: shipment.externalReference, accountFingerprint, ...status });
      desktopLog.info({ scope: "shipping", event: "shipping.provider.status.refresh.succeeded", message: "Kargo sağlayıcı durumu sorgulandı.", operationId, meta });
      return updated;
    } catch (caught) {
      const error = normalizeShippingProviderError(caught);
      desktopLog.warn({ scope: "shipping", event: `shipping.provider.${action}.failed`, message: error.message,
        operationId, meta: { ...meta, code: error.code, httpStatus: error.httpStatus }, error });
      throw error;
    } finally { this.activeShipments.delete(shipmentId); }
  }
  registerShipment(shipmentId: string) { return this.operation(shipmentId, "create"); }
  refreshShipmentStatus(shipmentId: string) { return this.operation(shipmentId, "status.refresh"); }
}
