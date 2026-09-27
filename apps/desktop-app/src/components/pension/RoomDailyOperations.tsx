import { useRef, useState } from "react";
import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { setRoomOperationalStatus } from "./room-operations";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";
import { formatDateRange } from "./folio-format";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";

export function RoomDailyOperations({ model, operations, disabled, onDirty }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; disabled: boolean; onDirty: (key: string, dirty: boolean) => void;
}) {
  const [condition, setCondition] = useState("");
  const checkoutMethod = useRef<RoomFolioPaymentMethod>("cash");
  const { confirm, confirmDialog } = useConfirmDialog();
  const { room, state, active } = model;
  if (!room || !state) return null;

  async function requestCheckout(stay: typeof active[number]) {
    checkoutMethod.current = "cash";
    const account = model.operations?.accounts.find(item => item.stayId === stay.id);
    const approved = await confirm({
      eyebrow: room.name,
      title: "Misafir çıkışı",
      description: account?.remainingMinor
        ? "Kalan tutar seçilen ödeme yöntemiyle tahsil edilir; çıkış ve hesap kapanışı birlikte tamamlanır."
        : "Misafir çıkışı tamamlanır; varsa oda hesabı kapatılır ve oda temizlik durumuna geçer.",
      confirmLabel: "Çıkış ve Hesabı Kapat",
      tone: account?.remainingMinor ? "warning" : "info",
      details: <RoomCheckoutConfirmationDetails
        roomLabel={room.number ? `Oda ${room.number}` : room.name}
        stay={stay}
        account={account}
        onPaymentMethodChange={method => { checkoutMethod.current = method; }}
      />
    });
    if (approved) void operations.checkout(stay.id, checkoutMethod.current);
  }

  async function requestCancel(stay: typeof active[number]) {
    const planned = stay.status === "planned";
    const approved = await confirm({
      eyebrow: room.name,
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
      {model.canCheckIn(stay.id) && <ActionButton disabled={disabled} onClick={() => void operations.checkIn(stay.id)}>Giriş Yap</ActionButton>}
      {stay.status === "planned" && !model.canCheckIn(stay.id) && <p>Giriş için oda hazır, boş ve konaklama kayıtları çakışmasız olmalı.</p>}
      {stay.status === "checked_in" && <ActionButton disabled={disabled} onClick={() => void requestCheckout(stay)}>Misafir Çıkışı</ActionButton>}
      <ActionButton variant="danger" disabled={disabled} onClick={() => void requestCancel(stay)}>{stay.status === "planned" ? "Planı İptal Et" : "Konaklamayı İptal Et"}</ActionButton>
    </section>)}
    {state.operationalCondition === "cleaning" && model.canSetCondition && <section className="operation-section form-stack">
      <h4>Oda temizlik bekliyor</h4><p>Temizlik ve hazırlık tamamlandığında odayı hazır olarak işaretleyin.</p>
      <ActionButton disabled={disabled} onClick={() => void operations.mutate("operations", () => setRoomOperationalStatus(room.id, "available"))}>Temizliği Tamamla</ActionButton>
    </section>}
    {model.canSetCondition && <form className="operation-section form-stack" onSubmit={event => { event.preventDefault();
      if (!model.canSetCondition || !condition) return;
      void operations.mutate("operations", () => setRoomOperationalStatus(room.id, condition)).then(ok => { if (ok) { setCondition(""); onDirty("condition", false); } });
    }}>
      <h4>Oda hazırlığı</h4>
      <fieldset className="form-stack" disabled={disabled || !model.canSetCondition}>
        <div className="form-field form-field--fluid">
          <span>Fiziksel oda durumu</span>
          <ChoiceChips
            ariaLabel="Fiziksel oda durumu"
            value={condition || (state.operationalCondition === "ready" ? "available" : state.operationalCondition)}
            disabled={disabled || !model.canSetCondition}
            onChange={value => { setCondition(value); onDirty("condition", true); }}
            options={[
              { id: "available", label: "Hazır" },
              { id: "cleaning", label: "Temizlik bekliyor" },
              { id: "maintenance", label: "Bakımda" },
              { id: "out_of_service", label: "Hizmet dışı" }
            ]}
          />
        </div>
        <ActionButton variant="secondary" type="submit" disabled={!condition}>Durumu Kaydet</ActionButton>
      </fieldset>
    </form>}
    {operations.feedback?.panel === "operations" && <p role={operations.feedback.error ? "alert" : "status"}>{operations.feedback.message}</p>}
    {confirmDialog}
  </>;
}
