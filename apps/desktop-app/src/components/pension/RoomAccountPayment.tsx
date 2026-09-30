import { useState } from "react";
import type { DesktopRoomFolio, RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { minorToInput, parseMoneyToMinor } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomAccountPayment({ folio, controller, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<RoomFolioPaymentMethod>("cash");
  const [error, setError] = useState("");
  return <form className="form-stack" aria-label={`${folio.customerName} ödemesi`} onSubmit={event => {
    event.preventDefault(); setError("");
    const value = parseMoneyToMinor(amount ?? minorToInput(folio.remainingMinor));
    if (value === null || value <= 0) { setError("Geçerli bir tutar girin."); return; }
    void controller.mutate(() => window.yardimciDesktop!.addRoomFolioPayment({ folioId: folio.id, amountMinor: value, paymentMethod: method }))
      .then(result => { if (result?.ok) { setAmount(null); onDirty(false); } });
  }}>
    <h4>Ödeme al</h4>
    <fieldset className="form-stack" disabled={disabled || folio.remainingMinor <= 0}>
      <div className="room-inline-action-row room-inline-action-row--payment">
        <label className="form-field room-money-field">Ödeme tutarı<MoneyInput required value={amount ?? minorToInput(folio.remainingMinor)} onChange={value => { setAmount(value); onDirty(true); }} /></label>
        <label className="form-field room-payment-method-field">Ödeme yöntemi<select aria-label="Ödeme yöntemi" value={method} onChange={event => { setMethod(event.target.value as RoomFolioPaymentMethod); onDirty(true); }}>
          <option value="cash">Nakit</option><option value="card">Kart</option><option value="bank">Banka</option><option value="other">Diğer</option>
        </select></label>
        <ActionButton type="submit">Ödemeyi Kaydet</ActionButton>
      </div>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
