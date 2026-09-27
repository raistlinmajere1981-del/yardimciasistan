import { useState } from "react";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { minorMoney, paymentMethodLabel, formatDateTime, formatDateRange } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";
import { RoomAccountPayment } from "./RoomAccountPayment";

export function RoomAccount({ controller, menuEnabled, currentStayId, ambiguous, disabled, onDirty }: {
  controller: RoomFolioController; menuEnabled: boolean; currentStayId?: string; ambiguous: boolean; disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const current = controller.selected;
  const previous = controller.folios.filter(item => item.stayId !== currentStayId && item.status === "open"
    && !controller.data.activeStays.some(stay => stay.id === item.stayId && ["planned", "checked_in"].includes(stay.status)));
  return <>
    {controller.loading && <p role="status">Hesap hazırlanıyor…</p>}
    {previous.some(folio => folio.remainingMinor > 0) && <p className="operation-prior-debt">Önceki borç · {minorMoney(previous.reduce((total, folio) => total + Math.max(0, folio.remainingMinor), 0))} · Aşağıda ayrı hesaplarda</p>}
    <section aria-label="Mevcut konaklama hesabı" className="form-stack">
      <h4>Mevcut konaklama</h4>
      {current ? <AccountRecord key={current.id} folio={current} controller={controller} menuEnabled={menuEnabled} disabled={disabled} onDirty={dirty => onDirty(current.id, dirty)} />
        : <><p>{ambiguous ? "Birden fazla girişli konaklama var; mevcut hesap belirlenemedi. Konaklama kayıtlarını kontrol edin." : currentStayId ? "Bu konaklama için hesap henüz açılmadı." : "Aktif misafir hesabı yok. Giriş tamamlandığında konaklama hesabı burada görünür."}</p>
          {currentStayId && <ActionButton disabled={disabled} onClick={() => void controller.mutate(() => window.yardimciDesktop!.openRoomFolio(currentStayId))}>Hesabı Aç</ActionButton>}</>}
    </section>
    {controller.feedbackScope === "account" && controller.message && <p role={controller.error ? "alert" : "status"}>{controller.message}</p>}
    {controller.error && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.refresh()}>Hesabı Yenile</ActionButton>}
    <section className="operation-section form-stack" aria-label="Önceki hesaplar">
      <h4>Önceki hesaplar</h4>
      {previous.length === 0 ? <p>Önceki konaklamalardan açık hesap yok.</p> : <>
        <p>Bu tutarlar mevcut konaklama hesabına dahil değildir.</p>
        {previous.map(folio => <AccountRecord key={folio.id} folio={folio} controller={controller} menuEnabled={menuEnabled} departed disabled={disabled} onDirty={dirty => onDirty(folio.id, dirty)} />)}
      </>}
    </section>
  </>;
}

function AccountRecord({ folio, controller, menuEnabled, departed = false, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; menuEnabled: boolean; departed?: boolean;
  disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState<{ paymentId: string } | "close" | null>(null);
  const [error, setError] = useState("");
  const open = folio.status === "open";
  return <article className="room-account-record form-stack" tabIndex={-1} data-folio-id={folio.id} data-stay-id={folio.stayId}>
    <div><strong>{folio.customerName}</strong><p>{departed ? "Çıkışı yapılmış konaklama" : open ? "Açık hesap" : "Kapalı hesap"} · {formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</p></div>
    <dl className="operation-facts">
      <div><dt>Konaklama · {folio.nights} gece</dt><dd>{minorMoney(folio.lodgingTotalMinor)}</dd></div>
      <div><dt>Ekstralar / indirimler</dt><dd>{minorMoney(folio.chargeTotalMinor - folio.lodgingTotalMinor)}</dd></div>
      <div><dt>Toplam</dt><dd>{minorMoney(folio.chargeTotalMinor)}</dd></div>
      <div><dt>Ödenen</dt><dd>{minorMoney(folio.paidTotalMinor)}</dd></div>
      <div className="operation-balance"><dt>Kalan</dt><dd>{minorMoney(folio.remainingMinor)}</dd></div>
    </dl>
    {open && <RoomAccountPayment folio={folio} controller={controller} disabled={disabled} onDirty={onDirty} />}
    {folio.items.length > 0 && <div className="room-folio-line-list">
      {folio.items.map(item => <article key={item.id}>
        <div><strong>{item.label}</strong><span>{item.kind === "menu" ? `${item.quantity} adet · ${minorMoney(item.unitPriceMinor)}` : item.kind === "discount" ? "İndirim" : "Ek ücret"}</span></div>
        <b>{minorMoney(item.lineTotalMinor)}</b>
        {open && <div className="action-row">
          {item.kind === "menu" && menuEnabled && <>
            <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını azalt`} onClick={() => void controller.mutate(() => item.quantity <= 1
              ? window.yardimciDesktop!.removeRoomFolioItem(item.id) : window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity - 1 }))}>−</ActionButton>
            <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını artır`} onClick={() => void controller.mutate(() => window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity + 1 }))}>+</ActionButton>
          </>}
          <ActionButton variant="danger" disabled={disabled} aria-label={`${item.label} kalemini çıkar`} onClick={() => void controller.mutate(() => window.yardimciDesktop!.removeRoomFolioItem(item.id))}>Çıkar</ActionButton>
        </div>}
      </article>)}
    </div>}
    <div className="room-folio-payment-history"><h4>Tahsilatlar</h4>
      {folio.payments.length === 0 && <p>Henüz tahsilat yok.</p>}
      {folio.payments.map(payment => <div key={payment.id}>
        <span>{paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)}{payment.origin === "reservation" && " · Kapora"}</span>
        <b>{minorMoney(payment.amountMinor)}</b>
        {open && payment.origin === "direct" && <ActionButton variant="danger" disabled={disabled} onClick={() => { setError(""); setConfirmation({ paymentId: payment.id }); }}>Tahsilatı Geri Al</ActionButton>}
      </div>)}
    </div>
    {departed && open && <ActionButton variant="secondary" disabled={disabled} onClick={() => { setError(""); setConfirmation("close"); }}>Hesabı Kapat</ActionButton>}
    {confirmation && <div className="operation-confirmation form-stack">
      <p>{confirmation === "close" ? "Hesap kapatılacak. Misafirin çıkış tarihi ve odanın temizlik durumu değişmeyecek." : "Seçilen tahsilat oda hesabından ve kasa kayıtlarından geri alınacak."}</p>
      <ActionButton variant="danger" disabled={disabled} onClick={() => {
        if (confirmation === "close" && folio.remainingMinor > 0) { setError("Açık borç varken hesap kapatılamaz. Önce ödeme alın."); return; }
        void controller.mutate(() => confirmation === "close" ? window.yardimciDesktop!.checkoutRoomFolio({ folioId: folio.id })
          : window.yardimciDesktop!.voidRoomFolioPayment(confirmation.paymentId)).then(result => { if (result?.ok) setConfirmation(null); });
      }}>{confirmation === "close" ? "Hesabı Kapatmayı Onayla" : "Tahsilatı Geri Almayı Onayla"}</ActionButton>
      <ActionButton variant="secondary" disabled={disabled} onClick={() => { setConfirmation(null); setError(""); }}>Vazgeç</ActionButton>
      {error && <p role="alert">{error}</p>}
    </div>}
  </article>;
}
