import { ARAS_SHIPPING_PROVIDER } from "@yardimci-asistan/shared";
import type { CommerceOrderStatus, CommerceShipmentStatus } from "@yardimci-asistan/shared";
import type { MarketOrdersSession } from "../../app/use-market-orders-session";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";

const labels: Record<CommerceShipmentStatus, string> = {
  draft: "Taslak", ready: "Hazır", dispatched: "Gönderildi", delivered: "Teslim edildi", cancelled: "İptal"
};

export function MarketOrderShipments({ session, orderStatus, busy }: {
  session: MarketOrdersSession; orderStatus: CommerceOrderStatus; busy: boolean;
}) {
  const { shippingProvider, shipments, loadingShipments, mutatingShipment, shipmentError, mutateShipment, reloadShipments } = session;
  const disabled = busy || loadingShipments || mutatingShipment;
  return (
    <section className="market-order-buyer" aria-label="Gönderim">
      <strong>Kargo / Gönderim</strong>
      {shippingProvider.enabled && !shippingProvider.configured && <p className="market-muted">{ARAS_SHIPPING_PROVIDER.name} yapılandırılmamış. Sağlayıcı işlemleri için Servisler ayarlarını tamamlayın.</p>}
      {loadingShipments && <p role="status">Gönderiler yükleniyor…</p>}
      {shipmentError && <p role="alert">{shipmentError}</p>}
      {shipmentError && <ActionButton variant="secondary" size="sm" onClick={() => void reloadShipments()} disabled={disabled}>Yenile</ActionButton>}
      {!loadingShipments && !shipmentError && shipments.length === 0 && (
        orderStatus === "cancelled" ? <p className="market-muted">İptal edilmiş sipariş için gönderi oluşturulamaz.</p>
          : <ActionButton size="sm" onClick={() => void mutateShipment()} disabled={disabled}>Gönderi oluştur</ActionButton>
      )}
      {shipments.map((shipment) => (
        <div key={shipment.id}>
          <StatusBadge tone={shipment.status === "delivered" ? "success" : shipment.status === "cancelled" ? "muted" : "info"}>
            {labels[shipment.status]}
          </StatusBadge>
          {shipment.providerName || shipment.providerId ? <p>Sağlayıcı: {shipment.providerName || shipment.providerId}</p> : null}
          {shipment.trackingNumber && <p>Takip: {shipment.trackingNumber}</p>}
          {shipment.trackingUrl && <p>Takip bağlantısı: {shipment.trackingUrl}</p>}
          <div className="action-row market-order-actions">
            {shippingProvider.enabled && !shipment.providerId && (shipment.status === "draft" || shipment.status === "ready") && orderStatus !== "cancelled" && (
              <ActionButton variant="secondary" size="sm" disabled={disabled || !shippingProvider.configured}
                onClick={() => void mutateShipment(shipment.id, undefined, "register")}>{ARAS_SHIPPING_PROVIDER.name} ile oluştur</ActionButton>
            )}
            {shippingProvider.enabled && shipment.providerId === ARAS_SHIPPING_PROVIDER.id && (
              <ActionButton variant="secondary" size="sm" disabled={disabled || !shippingProvider.configured}
                onClick={() => void mutateShipment(shipment.id, undefined, "refresh")}>Durumu güncelle</ActionButton>
            )}
            {shipment.status === "draft" && orderStatus !== "cancelled" && (
              <ActionButton size="sm" onClick={() => void mutateShipment(shipment.id, "ready")} disabled={disabled}>Hazırla</ActionButton>
            )}
            {shipment.status === "ready" && orderStatus !== "cancelled" && (
              <ActionButton size="sm" onClick={() => void mutateShipment(shipment.id, "dispatched")} disabled={disabled}>Gönderildi</ActionButton>
            )}
            {shipment.status === "dispatched" && (
              <ActionButton size="sm" onClick={() => void mutateShipment(shipment.id, "delivered")} disabled={disabled}>Teslim edildi</ActionButton>
            )}
            {!shipment.providerId && (shipment.status === "draft" || shipment.status === "ready") && (
              <ActionButton variant="danger" size="sm" onClick={() => void mutateShipment(shipment.id, "cancelled")} disabled={disabled}>İptal</ActionButton>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
