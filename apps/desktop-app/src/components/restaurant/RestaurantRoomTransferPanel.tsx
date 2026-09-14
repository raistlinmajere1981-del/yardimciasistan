import { BedDouble, ReceiptText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DesktopDashboardData, DesktopTableOrder } from "../../../electron/database";
import type { DesktopRoomFolioData } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { useDialogFocus } from "../ui/useDialogFocus";

interface RestaurantRoomTransferPanelProps {
  orders: DesktopTableOrder[];
  onOrderChanged: (order: DesktopTableOrder) => void;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

export function RestaurantRoomTransferPanel({
  orders,
  onOrderChanged,
  onDashboardDataChanged
}: RestaurantRoomTransferPanelProps) {
  const paymentOrders = useMemo(() => orders.filter((order) => order.status === "payment" && order.total > 0), [orders]);
  const paymentOrderKey = paymentOrders.map((order) => `${order.id}:${order.updatedAt}`).join("|");
  const [folioData, setFolioData] = useState<DesktopRoomFolioData | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedFolioId, setSelectedFolioId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationRef = useDialogFocus(confirmationOpen);

  const openFolios = useMemo(
    () => folioData?.folios.filter((folio) => folio.status === "open") ?? [],
    [folioData]
  );

  useEffect(() => {
    if (paymentOrders.length === 0) {
      setSelectedOrderId("");
      return;
    }
    if (!paymentOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(paymentOrders[0].id);
    }
  }, [paymentOrderKey, paymentOrders, selectedOrderId]);

  useEffect(() => {
    if (openFolios.length === 0) {
      setSelectedFolioId("");
      return;
    }
    if (!openFolios.some((folio) => folio.id === selectedFolioId)) {
      setSelectedFolioId(openFolios[0].id);
    }
  }, [openFolios, selectedFolioId]);

  useEffect(() => {
    if (paymentOrders.length === 0) return;
    const bridge = window.yardimciDesktop;
    if (!bridge) return;
    let active = true;
    void bridge.getRoomFolioData()
      .then((data) => {
        if (active) setFolioData(data);
      })
      .catch(() => {
        if (active) setMessage("Açık oda hesapları okunamadı.");
      });
    return () => {
      active = false;
    };
  }, [paymentOrderKey, paymentOrders.length]);

  if (paymentOrders.length === 0) {
    return null;
  }

  const selectedOrder = paymentOrders.find((order) => order.id === selectedOrderId) ?? paymentOrders[0];
  const selectedFolio = openFolios.find((folio) => folio.id === selectedFolioId) ?? null;

  function openTransferConfirmation() {
    if (!selectedOrder || !selectedFolio || loading) return;
    setConfirmationOpen(true);
  }

  async function transferToRoom() {
    const bridge = window.yardimciDesktop;
    if (!bridge || !selectedOrder || !selectedFolio || loading) return;

    setLoading(true);
    setMessage("Restoran adisyonu oda hesabına aktarılıyor...");
    try {
      const transferInput = {
        folioId: selectedFolio.id,
        kind: "manual_charge" as const,
        label: `Restoran · ${selectedOrder.tableName || "Masa"}`,
        amountMinor: Math.round(selectedOrder.total * 100),
        note: `Masa adisyonu · ${selectedOrder.id}`,
        sourceTableOrderId: selectedOrder.id
      };
      const result = await bridge.addRoomFolioManualItem(transferInput);
      setMessage(result.message);
      if (!result.ok) return;

      setFolioData(result.data);
      const [nextOrders, nextDashboard] = await Promise.all([
        bridge.listTableOrders(),
        bridge.getDashboardData()
      ]);
      const transferredOrder = nextOrders.find((order) => order.id === selectedOrder.id);
      if (transferredOrder) onOrderChanged(transferredOrder);
      onDashboardDataChanged(nextDashboard);
      setSelectedOrderId("");
      setConfirmationOpen(false);
    } catch {
      setMessage("Restoran adisyonu oda hesabına aktarılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel restaurant-room-transfer" aria-labelledby="restaurant-room-transfer-title">
      <header className="restaurant-room-transfer__heading">
        <span className="restaurant-room-transfer__icon" aria-hidden="true"><BedDouble size={18} /></span>
        <div className="restaurant-room-transfer__copy">
          <span className="panel-eyebrow">Pansiyon + Restoran</span>
          <h3 id="restaurant-room-transfer-title">Hesabı odaya yaz</h3>
          <p>Hesap bekleyen masa adisyonunu açık bir oda hesabına tek seferde aktarın.</p>
        </div>
        <StatusBadge tone="warning">{paymentOrders.length} hesap bekliyor</StatusBadge>
      </header>
      <div className="restaurant-room-transfer__body">
        {selectedOrder && (
          <dl className="restaurant-room-transfer__summary" aria-label="Aktarılacak adisyon özeti">
            <div><dt>Kaynak</dt><dd>{selectedOrder.tableName || "Masa"}</dd></div>
            <div><dt>Tutar</dt><dd>{formatMoney(selectedOrder.total, selectedOrder.items[0]?.currency || "TRY")}</dd></div>
            <div><dt>Durum</dt><dd>Hesap bekliyor</dd></div>
          </dl>
        )}
        <div className="restaurant-room-transfer__controls">
          <label className="form-field form-field--medium">
            <span>Masa hesabı</span>
          <select value={selectedOrder?.id ?? ""} onChange={(event) => setSelectedOrderId(event.target.value)} disabled={loading}>
            {paymentOrders.map((order) => (
              <option value={order.id} key={order.id}>
                {order.tableName || "Masa"} · {formatMoney(order.total, order.items[0]?.currency || "TRY")}
              </option>
            ))}
          </select>
          </label>
          <label className="form-field form-field--medium">
            <span>Oda hesabı</span>
          <select value={selectedFolio?.id ?? ""} onChange={(event) => setSelectedFolioId(event.target.value)} disabled={loading || openFolios.length === 0}>
            {openFolios.length === 0 ? (
              <option value="">Açık oda hesabı yok</option>
            ) : openFolios.map((folio) => (
              <option value={folio.id} key={folio.id}>
                {folio.roomNumber ? `Oda ${folio.roomNumber}` : folio.roomName} · {folio.customerName || "Misafir"}
              </option>
            ))}
          </select>
          </label>
          <ActionButton onClick={openTransferConfirmation} disabled={loading || !selectedFolio || !selectedOrder}>
            <ReceiptText size={15} aria-hidden="true" />
            {loading ? "Aktarılıyor" : "Odaya Yaz"}
          </ActionButton>
        </div>
      </div>
      <p className={message.includes("aktarılamadı") || message.includes("bulunamadı") ? "status-message status-message--danger" : "restaurant-room-transfer__message"} role="status" aria-live="polite">
        {message || (openFolios.length === 0
          ? "Önce Pansiyon > Oda Hesabı bölümünden misafirin oda hesabını açın."
          : "Aktarım masayı kapatır; tahsilat oda çıkışında kasaya işlenir.")}
      </p>
      {confirmationOpen && selectedOrder && selectedFolio && (
        <div className="overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !loading) setConfirmationOpen(false);
        }}>
          <section ref={confirmationRef} className="dialog dialog--compact restaurant-room-transfer__dialog" role="dialog" aria-modal="true" aria-labelledby="restaurant-room-transfer-confirm-title" aria-describedby="restaurant-room-transfer-confirm-description">
            <header className="overlay-header">
              <div>
                <span className="panel-eyebrow">Oda hesabına aktar</span>
                <h2 id="restaurant-room-transfer-confirm-title">Aktarımı onaylayın</h2>
              </div>
              <button className="overlay-close" type="button" data-dialog-close onClick={() => setConfirmationOpen(false)} disabled={loading} aria-label="Oda hesabına aktarım onayını kapat">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="overlay-body">
              <p id="restaurant-room-transfer-confirm-description">Bu aktarım masa adisyonunu kapatır; tahsilat oda hesabı kapatılırken kasaya işlenir.</p>
              <dl className="restaurant-room-transfer__confirmation">
                <div><dt>Kaynak</dt><dd>{selectedOrder.tableName || "Masa"}</dd></div>
                <div><dt>Hedef</dt><dd>{selectedFolio.roomNumber ? `Oda ${selectedFolio.roomNumber}` : selectedFolio.roomName} · {selectedFolio.customerName || "Misafir"}</dd></div>
                <div><dt>Tutar</dt><dd>{formatMoney(selectedOrder.total, selectedOrder.items[0]?.currency || "TRY")}</dd></div>
              </dl>
              {message && <p className={message.includes("aktarılamadı") || message.includes("bulunamadı") ? "status-message status-message--danger" : "restaurant-room-transfer__dialog-message"} role="status">{message}</p>}
            </div>
            <footer className="overlay-footer">
              <ActionButton variant="secondary" data-dialog-close onClick={() => setConfirmationOpen(false)} disabled={loading}>Vazgeç</ActionButton>
              <ActionButton onClick={() => void transferToRoom()} disabled={loading}>{loading ? "Aktarılıyor" : "Aktarımı Onayla"}</ActionButton>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
  }
}
