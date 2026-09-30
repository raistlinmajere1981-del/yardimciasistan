import { ActionButton } from "../ui/ActionButton";
import { useConfirmDialog } from "../ui/useConfirmDialog";
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

  async function requestCheckIn(stay: typeof active[number]) {
    if (!model.canCheckIn(stay.id)) return;
    if (data.kbsOverview.enabled) {
      const plannedGuests = (stay.guests ?? []).filter(guest => guest.status === "planned");
      const selectedCustomers = plannedGuests
        .map(guest => data.customers.find(customer => customer.id === guest.customerId))
        .filter((customer): customer is DesktopDashboardData["customers"][number] => Boolean(customer));
      const missingIdentity = selectedCustomers.filter(customer =>
        !customer.identityType || (!customer.identityNumber && !customer.documentSerialNumber) || !customer.nationality || !customer.birthDate
      );
      const kbsReady = data.kbsOverview.configured && missingIdentity.length === 0;
      const approved = await confirm({
        eyebrow: currentRoom.name,
        title: "Misafir girişini onaylayın",
        tone: kbsReady ? "info" : "warning",
        confirmLabel: kbsReady ? "Giriş Yap ve Bildirimi Hazırla" : "Giriş Yap, Bildirimi Beklet",
        description: !data.kbsOverview.configured
          ? "Konaklama girişe alınacak. KBS bağlantı ayarları tamamlanmadığı için bildirimler bekleyecek."
          : missingIdentity.length > 0
            ? "Konaklama girişe alınacak. Kimlik bilgileri eksik misafirlerin KBS bildirimi bekleyecek."
            : "Konaklama girişe alınacak ve listedeki misafirler için KBS giriş bildirimi oluşturulacak.",
        details: <dl className="operation-facts">
          <div><dt>Oda</dt><dd>{currentRoom.number ? "Oda " + currentRoom.number : currentRoom.name}</dd></div>
          <div><dt>Misafir</dt><dd>{plannedGuests.length} kişi</dd></div>
          <div><dt>Kurum</dt><dd>{data.kbsOverview.provider === "jandarma" ? "Jandarma KBS" : "Emniyet KBS"}</dd></div>
          <div><dt>Bağlantı</dt><dd>{data.kbsOverview.configured ? "Ayarlar hazır" : "Ayarlar eksik"}</dd></div>
          <div><dt>Kimlik durumu</dt><dd>{missingIdentity.length > 0 ? String(missingIdentity.length) + " misafirde eksik" : "Tüm misafirlerde hazır"}</dd></div>
          {missingIdentity.length > 0 && <div><dt>Eksik kayıtlar</dt><dd>{missingIdentity.map(customer => customer.fullName).join(", ")}</dd></div>}
        </dl>
      });
      if (!approved) return;
    }
    void operations.checkIn(stay.id);
  }

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
      <div className="room-section-heading">
        <h4>{stay.status === "checked_in" ? "Konaklama" : "Planlanan giriş"}</h4>
        <span>{formatDateRange(stay.checkInDate, stay.checkOutDate)}</span>
      </div>
      {model.canCheckIn(stay.id) && <ActionButton disabled={disabled} onClick={() => void requestCheckIn(stay)}>Giriş Yap</ActionButton>}
      {stay.status === "planned" && !model.canCheckIn(stay.id) && <p>Giriş için oda hazır ve boş olmalı.</p>}
      {stay.status === "checked_in" && <ActionButton disabled={disabled} onClick={() => void requestCheckout(stay)}>Çıkışı Tamamla</ActionButton>}
      {stay.status === "planned" && <ActionButton variant="danger" disabled={disabled} onClick={() => void requestCancel(stay)}>Planı İptal Et</ActionButton>}
    </section>)}
    {isOutOfService && <section className="operation-section form-stack">
      <h4>Oda hazırlığı</h4>
      <p>Oda hizmet dışı. Ayarlar &gt; İşletme Düzeni &gt; Oda Yönetimi&apos;nden yeniden kullanıma alınabilir.</p>
    </section>}
    {confirmDialog}
  </>;
}
