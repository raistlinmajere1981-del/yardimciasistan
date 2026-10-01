import { useState } from "react";
import type { DesktopRoomFolio, RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";
import { MoneyInput } from "../ui/MoneyInput";
import { formatDateRange, minorMoney, minorToInput, parseMoneyToMinor } from "../pension/folio-format";

export function RoomReceivablePaymentDialog({ folio, closeWhenSettled, onClose, onSaved }: {
  folio: DesktopRoomFolio;
  closeWhenSettled: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [amount, setAmount] = useState(minorToInput(folio.remainingMinor));
  const [paymentMethod, setPaymentMethod] = useState<RoomFolioPaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const amountMinor = parseMoneyToMinor(amount);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Geçerli bir tahsilat tutarı girin.");
      return;
    }
    if (amountMinor > folio.remainingMinor) {
      setError("Tahsilat kalan borçtan büyük olamaz.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payment = await window.yardimciDesktop!.addRoomFolioPayment({
        folioId: folio.id,
        amountMinor,
        paymentMethod
      });
      if (!payment.ok) {
        setError(payment.message);
        return;
      }

      let closeWarning = "";
      if (closeWhenSettled && amountMinor === folio.remainingMinor) {
        const closed = await window.yardimciDesktop!.checkoutRoomFolio({ folioId: folio.id });
        if (!closed.ok) closeWarning = `Tahsilat alındı; hesap kapanışı doğrulanamadı. ${closed.message}`;
      }

      reportAppStatus(closeWarning ? "error" : "success",
        closeWarning || (amountMinor === folio.remainingMinor ? "Borç tamamen tahsil edildi." : "Tahsilat kaydedildi."));
      await onSaved();
      onClose();
    } catch {
      setError("Tahsilat kaydedilemedi. Yeniden deneyin.");
    } finally {
      setSaving(false);
    }
  }

  return <FormDialog
    title="Tahsilat al"
    onClose={() => { if (!saving) onClose(); }}
    closeBlocked={saving}
    dismissOnBackdrop
    onSubmit={(event) => { event.preventDefault(); void submit(); }}
    footer={<div className="action-row">
      <ActionButton variant="secondary" type="button" disabled={saving} onClick={onClose}>Vazgeç</ActionButton>
      <ActionButton type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Tahsilatı Kaydet"}</ActionButton>
    </div>}
  >
    <section className="panel form-stack" aria-label="Tahsilat bilgileri">
      <div>
        <strong>{folio.customerName}</strong>
        <p>{folio.roomNumber ? `Oda ${folio.roomNumber}` : folio.roomName} · {formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</p>
      </div>
      <dl className="operation-facts">
        <div><dt>Kalan borç</dt><dd>{minorMoney(folio.remainingMinor, folio.currency)}</dd></div>
        <div><dt>Toplam hesap</dt><dd>{minorMoney(folio.chargeTotalMinor, folio.currency)}</dd></div>
        <div><dt>Ödenen</dt><dd>{minorMoney(folio.paidTotalMinor, folio.currency)}</dd></div>
      </dl>
      <div className="form-grid">
        <label className="form-field">
          <span>Tahsilat tutarı</span>
          <MoneyInput required value={amount} onChange={setAmount} />
        </label>
        <label className="form-field">
          <span>Ödeme yöntemi</span>
          <select aria-label="Tahsilat ödeme yöntemi" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as RoomFolioPaymentMethod)}>
            <option value="cash">Nakit</option>
            <option value="card">Kart</option>
            <option value="bank">Banka</option>
            <option value="other">Diğer</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  </FormDialog>;
}
