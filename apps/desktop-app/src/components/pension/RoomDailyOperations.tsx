import { useState } from "react";
import { ActionButton } from "../ui/ActionButton";
import { setRoomOperationalStatus } from "./room-operations";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";

export function RoomDailyOperations({ model, operations, disabled, onDirty }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; disabled: boolean; onDirty: (key: string, dirty: boolean) => void;
}) {
  const [condition, setCondition] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: "checkout" | "cancel"; stayId: string } | null>(null);
  const { room, state, active } = model;
  if (!room || !state) return null;
  return <>
    {active.map(stay => <section className="operation-section form-stack" key={stay.id}>
      <h4>{stay.customerName}</h4>
      {model.canCheckIn(stay.id) && <ActionButton disabled={disabled} onClick={() => void operations.checkIn(stay.id)}>Giriş Yap</ActionButton>}
      {stay.status === "planned" && !model.canCheckIn(stay.id) && <p>Giriş için oda hazır, boş ve konaklama kayıtları çakışmasız olmalı.</p>}
      {stay.status === "checked_in" && <ActionButton disabled={disabled} onClick={() => setConfirmation({ kind: "checkout", stayId: stay.id })}>Misafir Çıkışı</ActionButton>}
      <ActionButton variant="danger" disabled={disabled} onClick={() => setConfirmation({ kind: "cancel", stayId: stay.id })}>{stay.status === "planned" ? "Planı İptal Et" : "Konaklamayı İptal Et"}</ActionButton>
    </section>)}
    {confirmation && <section className="operation-confirmation form-stack" aria-label="Konaklama onayı">
      <p>{confirmation.kind === "checkout" ? "Misafir çıkışı tamamlanır, oda temizlik durumuna geçer. Borç varsa hesap açık kalır." : "Konaklama iptal edilir; rezervasyon değişmez. Fiziksel çıkış için Misafir Çıkışı işlemini kullanın."}</p>
      <div className="action-row"><ActionButton variant={confirmation.kind === "cancel" ? "danger" : "primary"} disabled={disabled} onClick={() => {
        const promise = confirmation.kind === "checkout" ? operations.checkout(confirmation.stayId)
          : operations.mutate("operations", () => window.yardimciDesktop!.updateCustomerRoomStayStatus({ stayId: confirmation.stayId, status: "cancelled" }));
        void promise.then(ok => { if (ok) setConfirmation(null); });
      }}>{confirmation.kind === "checkout" ? "Çıkışı Tamamla" : "İptali Onayla"}</ActionButton>
        <ActionButton variant="secondary" disabled={disabled} onClick={() => setConfirmation(null)}>Vazgeç</ActionButton></div>
    </section>}
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
        <label className="form-field">Fiziksel oda durumu<select aria-label="Fiziksel oda durumu" value={condition || (state.operationalCondition === "ready" ? "available" : state.operationalCondition)} onChange={event => { setCondition(event.target.value); onDirty("condition", true); }}>
          <option value="available">Hazır</option><option value="cleaning">Temizlik bekliyor</option><option value="maintenance">Bakımda</option><option value="out_of_service">Hizmet dışı</option>
        </select></label>
        <ActionButton variant="secondary" type="submit" disabled={!condition}>Durumu Kaydet</ActionButton>
      </fieldset>
    </form>}
    {operations.feedback?.panel === "operations" && <p role={operations.feedback.error ? "alert" : "status"}>{operations.feedback.message}</p>}
  </>;
}
