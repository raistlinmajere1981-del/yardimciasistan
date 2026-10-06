import { useRef, useState } from "react";
import type { DesktopCustomerRoomStay, DesktopDashboardData } from "../../../electron/database-types";
import type { DesktopRoom } from "../../../electron/database";
import type { DesktopRoomFolio, RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { reportAppStatus } from "../../app/runtime-state";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";
import { minorMoney } from "./folio-format";

interface CheckoutChoices {
  settleCurrent: boolean;
  includePrevious: boolean;
  paymentMethod: RoomFolioPaymentMethod;
}

export function useRoomCheckout({ room, stay, data, folioEnabled, onDashboard }: {
  room?: DesktopRoom;
  stay?: DesktopCustomerRoomStay;
  data: DesktopDashboardData;
  folioEnabled: boolean;
  onDashboard: (data: DesktopDashboardData) => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function requestCheckout() {
    if (running.current || !room || !stay || stay.status !== "checked_in") return;
    running.current = true;
    setBusy(true);
    try {
      const folioData = folioEnabled ? await window.yardimciDesktop!.getRoomFolioData(room.id) : null;
      const currentFolio = folioData?.folios.find(item => item.stayId === stay.id && item.status === "open");
      const activeStayIds = new Set(folioData?.activeStays.map(item => item.id) ?? []);
      const previousFolios = (folioData?.folios ?? []).filter(item =>
        item.stayId !== stay.id
        && item.customerId === stay.customerId
        && item.status === "open"
        && item.remainingMinor > 0
        && !activeStayIds.has(item.stayId)
      );
      const choices: CheckoutChoices = { settleCurrent: false, includePrevious: false, paymentMethod: "cash" };
      const guestIds = (stay.guests ?? []).filter(guest => guest.status === "checked_in").map(guest => guest.customerId);
      const openOrders = (data.tableOperations ?? []).filter(table => table.order
        && data.tables.some(resource => resource.id === table.tableId && guestIds.includes(resource.currentCustomerId)));

      const approved = await confirm({
        eyebrow: room.name,
        title: "Misafir çıkışı",
        description: "Tüm misafirlerin çıkışı yapılır ve oda temizlik durumuna geçer. Açık hesapları isterseniz bu işlem sırasında tahsil edebilirsiniz.",
        confirmLabel: "Tüm Misafirlerin Çıkışını Yap",
        tone: currentFolio?.remainingMinor || previousFolios.length || openOrders.length ? "warning" : "info",
        details: <>
          <RoomCheckoutSettlementOptions
            roomLabel={room.number ? `Oda ${room.number}` : room.name}
            stay={stay}
            currentFolio={currentFolio}
            previousFolios={previousFolios}
            onSettleCurrent={value => { choices.settleCurrent = value; }}
            onIncludePrevious={value => { choices.includePrevious = value; }}
            onPaymentMethod={value => { choices.paymentMethod = value; }}
          />
          {openOrders.length > 0 && <p role="alert">
            Misafirlere bağlı {openOrders.length} açık restoran adisyonu var. Bunlar oda hesabına dahil değil; aktarımı çıkıştan önce tamamlayın.
          </p>}
        </>
      });
      if (!approved) return;

      const checkout = await window.yardimciDesktop!.checkoutStayWithSettlement({
        stayId: stay.id, roomId: room.id, settleCurrent: choices.settleCurrent,
        previousFolioIds: choices.includePrevious ? previousFolios.map(folio => folio.id) : [],
        paymentMethod: choices.paymentMethod
      });
      if (!checkout.ok) {
        reportAppStatus("error", checkout.message);
        return;
      }
      onDashboard(checkout.dashboardData);

      const partial = checkout.settlements.some(step => !step.result.ok || step.result.closure !== "closed");
      reportAppStatus(partial ? "error" : "success", checkout.message);
    } catch {
      reportAppStatus("error", "Çıkış işlemi sonucu doğrulanamadı. Hesap ve oda durumunu kontrol edin.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { busy, requestCheckout, checkoutDialog: confirmDialog };
}

function RoomCheckoutSettlementOptions({ roomLabel, stay, currentFolio, previousFolios, onSettleCurrent, onIncludePrevious, onPaymentMethod }: {
  roomLabel: string;
  stay: DesktopCustomerRoomStay;
  currentFolio?: DesktopRoomFolio;
  previousFolios: DesktopRoomFolio[];
  onSettleCurrent: (value: boolean) => void;
  onIncludePrevious: (value: boolean) => void;
  onPaymentMethod: (value: RoomFolioPaymentMethod) => void;
}) {
  const [settleCurrent, setSettleCurrent] = useState(false);
  const [includePrevious, setIncludePrevious] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<RoomFolioPaymentMethod>("cash");
  const currentRemaining = currentFolio?.remainingMinor ?? 0;
  const previousTotal = previousFolios.reduce((total, folio) => total + folio.remainingMinor, 0);
  const previousCurrencies = new Set(previousFolios.map(folio => folio.currency));
  const currencies = new Set([
    ...(settleCurrent && currentFolio ? [currentFolio.currency] : []),
    ...(includePrevious ? previousFolios.map(folio => folio.currency) : [])
  ]);
  const selectedTotal = (settleCurrent ? currentRemaining : 0) + (includePrevious ? previousTotal : 0);
  const selectedCurrency = currencies.size === 1 ? [...currencies][0] : "";
  const takingPayment = settleCurrent || includePrevious;

  return <div className="form-stack">
    <RoomCheckoutConfirmationDetails roomLabel={roomLabel} stay={stay} account={currentFolio} showResult={false} />
    {(currentRemaining > 0 || previousFolios.length > 0) && <fieldset className="form-stack" aria-label="Çıkış tahsilatı">
      {currentRemaining > 0 && <label className="form-check">
        <input type="checkbox" checked={settleCurrent} onChange={event => {
          setSettleCurrent(event.target.checked);
          onSettleCurrent(event.target.checked);
        }} />
        <span>Mevcut hesabı tahsil et ve kapat · {minorMoney(currentRemaining, currentFolio?.currency ?? "TRY")}</span>
      </label>}
      {previousFolios.length > 0 && <label className="form-check">
        <input type="checkbox" checked={includePrevious} onChange={event => {
          setIncludePrevious(event.target.checked);
          onIncludePrevious(event.target.checked);
        }} />
        <span>Bu müşterinin eski borçlarını da tahsil et · {previousFolios.length} hesap{previousCurrencies.size === 1 ? ` · ${minorMoney(previousTotal, previousFolios[0]?.currency ?? "TRY")}` : ""}</span>
      </label>}
      {takingPayment && <label className="form-field">
        <span>Ödeme yöntemi</span>
        <select aria-label="Çıkış ödeme yöntemi" value={paymentMethod} onChange={event => {
          const value = event.target.value as RoomFolioPaymentMethod;
          setPaymentMethod(value);
          onPaymentMethod(value);
        }}>
          <option value="cash">Nakit</option>
          <option value="card">Kart</option>
          <option value="bank">Banka</option>
          <option value="other">Diğer</option>
        </select>
      </label>}
      {takingPayment && <p>
        Tahsil edilecek: {selectedCurrency ? minorMoney(selectedTotal, selectedCurrency) : "Seçilen hesapların tamamı"}
      </p>}
    </fieldset>}
    <p><strong>Sonuç:</strong> Çıkış tamamlanır · oda temizlik bekler
      {settleCurrent ? " · mevcut hesap kapanır" : currentRemaining > 0 ? " · mevcut borç açık hesapta kalır" : ""}
      {includePrevious ? " · seçilen eski borçlar kapanır" : ""}</p>
  </div>;
}
