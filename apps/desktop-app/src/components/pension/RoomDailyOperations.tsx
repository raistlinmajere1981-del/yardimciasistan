import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { setRoomOperationalStatus } from "./room-operations";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";
import { formatDateRange } from "./folio-format";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import type { DesktopDashboardData } from "../../../electron/database";

export function RoomDailyOperations({ model, operations, disabled, data }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; disabled: boolean; data: DesktopDashboardData;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const { room, state, active } = model;
  if (!room || !state) return null;
  const currentRoom = room;
  const isOutOfService = currentRoom.status === "out_of_service" || state.operationalCondition === "out_of_service";

  async function requestCheckout(stay: typeof active[number]) {
    const account = model.operations?.accounts.find(item => item.stayId === stay.id);
    const guestIds = (stay.guests ?? []).filter(guest => guest.status === "checked_in").map(guest => guest.customerId);
    const openOrders = (data.tableOperations ?? []).filter(table => table.order && data.tables.some(resource => resource.id === table.tableId && guestIds.includes(resource.currentCustomerId)));
    const approved = await confirm({
      eyebrow: currentRoom.name,
      title: "Misafir çıkışı",
      description: account?.remainingMinor
        ? "Tüm misafirlerin çıkışı yapılır. Kalan borç ortak hesapta açık kalır; tahsilat ayrıca kaydedilir."
        : "Misafir çıkışı tamamlanır; varsa oda hesabı kapatılır ve oda temizlik durumuna geçer.",
      confirmLabel: "Tüm Misafirlerin Çıkışını Yap",
      tone: account?.remainingMinor ? "warning" : "info",
      details: <><RoomCheckoutConfirmationDetails
        roomLabel={currentRoom.number ? `Oda ${currentRoom.number}` : currentRoom.name}
        stay={stay}
        account={account}
      />{openOrders.length > 0 && <p role="alert">Misafirlere bağlı {openOrders.length} açık restoran adisyonu var. Bunlar oda hesabına dahil değil; aktarımı çıkıştan önce tamamlayın.</p>}</>
    });
    if (approved) void operations.checkout(stay.id);
  }

  async function requestCancel(stay: typeof active[number]) {
    const planned = stay.status === "planned";
    const approved = await confirm({
      eyebrow: currentRoom.name,
      title: planned ? "Konaklama planını iptal et" : "Konaklamayı iptal et",
      description: "Rezervasyon kaydı değişmez. Fiziksel çıkış gereken bir konaklamada Misafir Çıkışı işlemini kullanın.",
      confirmLabel: planned ? "Planı İptal Et" : "Konaklamayı İptal Et",
      tone: "danger",
      details: <dl className="operation-facts">
        <div><dt>Misafir</dt><dd>{stay.customerName} · {stay.guestCount} kişi</dd></div>
        <div><dt>Konaklama</dt><dd>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</dd></div>
      </dl>
    });
    if (!approved) return;
    void operations.mutate("operations", () => window.yardimciDesktop!.updateCustomerRoomStayStatus({ stayId: stay.id, status: "cancelled" }));
  }

  return <>
    {active.map(stay => <section className="operation-section form-stack" key={stay.id}>
      <h4>{stay.customerName}</h4>
      {model.canCheckIn(stay.id) && <><p>Giriş yalnız listedeki {(stay.guests ?? []).filter(guest => guest.status === "planned").length} kayıtlı misafir için yapılır.</p>
        <ActionButton disabled={disabled} onClick={() => void operations.checkIn(stay.id)}>Giriş Yap</ActionButton></>}
      {stay.status === "planned" && !model.canCheckIn(stay.id) && <p>Giriş için oda hazır, boş ve konaklama kayıtları çakışmasız olmalı.</p>}
      {stay.status === "checked_in" && <ActionButton disabled={disabled} onClick={() => void requestCheckout(stay)}>Misafir Çıkışı</ActionButton>}
      {stay.status === "planned" && <ActionButton variant="danger" disabled={disabled} onClick={() => void requestCancel(stay)}>Planı İptal Et</ActionButton>}
    </section>)}
    {isOutOfService && <section className="operation-section form-stack">
      <h4>Oda hazırlığı</h4>
      <p>Oda hizmet dışı. Ayarlar &gt; İşletme Düzeni &gt; Oda Yönetimi&apos;nden yeniden kullanıma alınabilir.</p>
    </section>}
    {!isOutOfService && model.canSetCondition && <section className="operation-section form-stack">
      <h4>Oda hazırlığı</h4>
      <div className="form-field form-field--fluid">
        <span>Fiziksel oda durumu</span>
        <ChoiceChips
          ariaLabel="Fiziksel oda durumu"
          value={state.operationalCondition === "ready" ? "available" : state.operationalCondition}
          disabled={disabled || !model.canSetCondition}
          onChange={value => {
            if (value === "out_of_service") return;
            const current = state.operationalCondition === "ready" ? "available" : state.operationalCondition;
            if (value === current) return;
            void operations.mutate("operations", () => setRoomOperationalStatus(room.id, value));
          }}
          options={[
            { id: "available", label: "Hazır" },
            { id: "cleaning", label: "Temizlik bekliyor" },
            { id: "maintenance", label: "Bakımda" }
          ]}
        />
      </div>
    </section>}
    {operations.feedback?.panel === "operations" && <p role={operations.feedback.error ? "alert" : "status"}>{operations.feedback.message}</p>}
    {confirmDialog}
  </>;
}
