import { useMemo, useState } from "react";
import type { DesktopRoomFolio, DesktopRoomFolioMutationResult, RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { minorMoney, minorToInput, parseMoneyToMinor, paymentMethodLabel, formatDateTime, formatDateRange } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";

export type AccountFlow = "add-charge" | "add-menu-item" | "payment" | "void-payment" | "account-details" | "close-account";
export interface AccountOperation { kind: AccountFlow; paymentId?: string }

export function RoomAccount({ controller, menuEnabled, departed, onAction }: {
  controller: RoomFolioController; menuEnabled: boolean; departed: boolean; onAction: (operation: AccountOperation) => void;
}) {
  const folio = controller.selected;
  if (controller.loading) return <p role="status">Hesap hazırlanıyor…</p>;
  if (!folio) return <p>Bu oda için kullanılabilir hesap yok. Giriş işlemi Konaklama sekmesinden yapılır.</p>;
  const open = folio.status === "open";
  return <div className="form-stack">
    <label className="form-field form-field--long">Oda hesabı<select aria-label="Oda hesabı" disabled={controller.busy} value={folio.id} onChange={event => controller.select(event.target.value)}>
      {controller.folios.map(item => <option key={item.id} value={item.id}>{item.customerName} · {formatDateRange(item.checkInDate, item.plannedCheckOutDate)} · {item.status === "open" ? "Açık" : "Kapalı"}</option>)}
    </select></label>
    <p>{open ? "Açık hesap" : "Kapalı hesap"} · {folio.customerName} · {formatDateRange(folio.checkInDate, folio.plannedCheckOutDate)}</p>
    <div className="room-folio-totals">
      <span>Toplam <strong>{minorMoney(folio.chargeTotalMinor)}</strong></span>
      <span>Tahsil edilen <strong>{minorMoney(folio.paidTotalMinor)}</strong></span>
      <span className={folio.remainingMinor > 0 ? "is-waiting" : "is-paid"}>Kalan <strong>{minorMoney(folio.remainingMinor)}</strong></span>
    </div>
    {open && <div className="action-row">
      {menuEnabled && <ActionButton variant="secondary" onClick={() => onAction({ kind: "add-menu-item" })}>Ürün/Hizmet Ekle</ActionButton>}
      <ActionButton variant="secondary" onClick={() => onAction({ kind: "add-charge" })}>Ücret / İndirim Ekle</ActionButton>
      <ActionButton disabled={folio.remainingMinor <= 0} onClick={() => onAction({ kind: "payment" })}>Ödeme Al</ActionButton>
      {departed && <ActionButton variant="secondary" onClick={() => onAction({ kind: "close-account" })}>Hesabı Kapat</ActionButton>}
    </div>}
    <div className="room-folio-line-list">
      <article><div><strong>Konaklama · {folio.nights} gece</strong><span>{minorMoney(folio.nightlyPriceMinor)} / gece · {folio.guestCount} kişi</span></div>
        <b>{minorMoney(folio.lodgingTotalMinor)}</b>
        {open && <ActionButton variant="secondary" onClick={() => onAction({ kind: "account-details" })}>Hesap Bilgilerini Düzenle</ActionButton>}
      </article>
      {folio.items.map(item => <article key={item.id}>
        <div><strong>{item.label}</strong><span>{item.kind === "menu" ? `${item.quantity} adet · ${minorMoney(item.unitPriceMinor)}` : item.kind === "discount" ? "İndirim" : "Ek ücret"}</span></div>
        <b>{minorMoney(item.lineTotalMinor)}</b>
        {open && <div className="action-row">
          {item.kind === "menu" && menuEnabled && <>
            <ActionButton variant="secondary" disabled={controller.busy} aria-label={`${item.label} miktarını azalt`} onClick={() => void controller.mutate(() => item.quantity <= 1
              ? window.yardimciDesktop!.removeRoomFolioItem(item.id)
              : window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity - 1 }))}>−</ActionButton>
            <ActionButton variant="secondary" disabled={controller.busy} aria-label={`${item.label} miktarını artır`} onClick={() => void controller.mutate(() => window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity + 1 }))}>+</ActionButton>
          </>}
          <ActionButton variant="danger" disabled={controller.busy} aria-label={`${item.label} kalemini çıkar`} onClick={() => void controller.mutate(() => window.yardimciDesktop!.removeRoomFolioItem(item.id))}>Çıkar</ActionButton>
        </div>}
      </article>)}
    </div>
    <div className="room-folio-payment-history"><h3>Tahsilatlar</h3>
      {folio.payments.length === 0 && <p>Henüz tahsilat yok.</p>}
      {folio.payments.map(payment => <div key={payment.id}>
        <span>{paymentMethodLabel(payment.paymentMethod)} · {formatDateTime(payment.paidAt)}{payment.origin === "reservation" && " · Kapora"}</span>
        <b>{minorMoney(payment.amountMinor)}</b>
        {open && payment.origin === "direct" && <ActionButton variant="danger" onClick={() => onAction({ kind: "void-payment", paymentId: payment.id })}>Tahsilatı Geri Al</ActionButton>}
      </div>)}
    </div>
    {departed && <p>Misafir çıkışı tamamlandı. Tahsilat ve hesabı kapatma, odanın temizlik durumunu değiştirmez.</p>}
  </div>;
}

export const accountFlowTitle: Record<AccountFlow, string> = {
  "add-charge": "Ücret / İndirim Ekle", "add-menu-item": "Ürün/Hizmet Ekle", payment: "Ödeme Al",
  "void-payment": "Tahsilatı Geri Al", "account-details": "Hesap Bilgilerini Düzenle", "close-account": "Hesabı Kapat"
};

// Bounded operation body. It is mounted inside the existing Room Workspace modal.
export function RoomAccountOperation({ operation, folio, controller, onDone }: {
  operation: AccountOperation; folio: DesktopRoomFolio; controller: RoomFolioController; onDone: () => void;
}) {
  const [amount, setAmount] = useState(operation.kind === "payment" ? minorToInput(folio.remainingMinor) : "");
  const [method, setMethod] = useState<RoomFolioPaymentMethod>("cash");
  const [kind, setKind] = useState<"manual_charge" | "discount">("manual_charge");
  const [label, setLabel] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [guestCount, setGuestCount] = useState(folio.guestCount);
  const [start, setStart] = useState(folio.checkInDate);
  const [end, setEnd] = useState(folio.plannedCheckOutDate);
  const [nightly, setNightly] = useState(minorToInput(folio.nightlyPriceMinor));
  const [manual, setManual] = useState(folio.lodgingManualOverride);
  const [total, setTotal] = useState(minorToInput(folio.lodgingTotalMinor));
  const [error, setError] = useState("");
  const filteredMenu = useMemo(() => controller.data.menuItems.filter(item =>
    (category === "all" || item.categoryId === category) && `${item.name} ${item.description}`.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR"))
  ), [category, controller.data.menuItems, search]);
  async function run(call: () => Promise<DesktopRoomFolioMutationResult>) {
    const result = await controller.mutate(call);
    if (result?.ok) onDone();
  }
  const bridge = window.yardimciDesktop!;
  async function submit() {
    setError("");
    const value = parseMoneyToMinor(amount);
    if (operation.kind === "payment" || operation.kind === "add-charge") {
      if (value <= 0) { setError("Geçerli bir tutar girin."); return; }
      if (operation.kind === "payment") await run(() => bridge.addRoomFolioPayment({ folioId: folio.id, amountMinor: value, paymentMethod: method }));
      else await run(() => bridge.addRoomFolioManualItem({ folioId: folio.id, kind, label: label.trim(), amountMinor: value }));
    } else if (operation.kind === "void-payment" && operation.paymentId) {
      await run(() => bridge.voidRoomFolioPayment(operation.paymentId!));
    } else if (operation.kind === "close-account") {
      if (folio.remainingMinor > 0) { setError("Açık borç varken hesap kapatılamaz. Önce ödeme alın."); return; }
      await run(() => bridge.checkoutRoomFolio({ folioId: folio.id }));
    } else if (operation.kind === "account-details") {
      if (parseMoneyToMinor(nightly) < 0 || (manual && parseMoneyToMinor(total) < 0)) { setError("Konaklama tutarlarını kontrol edin."); return; }
      await run(() => bridge.updateRoomFolioDetails({ folioId: folio.id, guestCount, checkInDate: start, plannedCheckOutDate: end,
        nightlyPriceMinor: parseMoneyToMinor(nightly), lodgingManualOverride: manual, lodgingTotalMinor: manual ? parseMoneyToMinor(total) : undefined }));
    }
  }
  return <form className="form-stack" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <fieldset className="form-stack" disabled={controller.busy}>
      {operation.kind === "add-menu-item" ? <>
        <label className="form-field form-field--long">Ürün ara<input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="form-field form-field--medium">Kategori<select aria-label="Kategori" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Tümü</option>
          {controller.data.menuCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <div className="room-folio-menu-list">{filteredMenu.map(item => <article key={item.id}>
          <div><strong>{item.name}</strong><span>{item.categoryName}</span></div><b>{minorMoney(item.priceMinor)}</b>
          <ActionButton disabled={item.stockQuantity !== null && item.stockQuantity < item.stockConsumptionQuantity} onClick={() => {
            const existing = folio.items.find(line => line.kind === "menu" && line.menuItemId === item.id && !line.note.trim());
            void run(() => existing ? bridge.updateRoomFolioItemQuantity({ itemId: existing.id, quantity: existing.quantity + 1 })
              : bridge.addRoomFolioMenuItem({ folioId: folio.id, menuItemId: item.id, quantity: 1 }));
          }}>Ekle</ActionButton>
        </article>)}</div>
      </> : operation.kind === "account-details" ? <>
        <div className="form-row">
          <label className="form-field form-field--xs">Kişi sayısı<input type="number" required min={1} max={50} value={guestCount} onChange={event => setGuestCount(Number(event.target.value))} /></label>
          <label className="form-field form-field--short">Giriş tarihi<input lang="tr-TR" type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
          <label className="form-field form-field--short">Çıkış tarihi<input lang="tr-TR" type="date" min={start} value={end} onChange={event => setEnd(event.target.value)} /></label>
          <label className="form-field form-field--short">Gecelik fiyat<input required inputMode="decimal" value={nightly} onChange={event => setNightly(event.target.value)} /></label>
        </div>
        <p>Bu hesaba ait fiyat değişir. Odanın varsayılan fiyatı Ayarlar → Oda Yönetimi bölümündedir.</p>
        <label className="form-check"><input type="checkbox" checked={manual} onChange={event => setManual(event.target.checked)} />Konaklama toplamını elle belirle</label>
        {manual && <label className="form-field form-field--short">Konaklama toplamı<input inputMode="decimal" value={total} onChange={event => setTotal(event.target.value)} /></label>}
      </> : operation.kind === "void-payment" ? <p>Seçilen tahsilat oda hesabından ve kasa kayıtlarından geri alınacak.</p>
        : operation.kind === "close-account" ? <p>{folio.remainingMinor > 0 ? `${minorMoney(folio.remainingMinor)} açık borç var. Önce ödeme alın.` : "Hesap kapatılacak. Misafirin çıkış tarihi ve odanın temizlik durumu değişmeyecek."}</p>
        : <>
          {operation.kind === "add-charge" && <>
            <label className="form-field form-field--medium">Kalem türü<select aria-label="Kalem türü" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="manual_charge">Ek ücret</option><option value="discount">İndirim</option></select></label>
            <label className="form-field form-field--long">Açıklama<input required value={label} onChange={event => setLabel(event.target.value)} /></label>
          </>}
          <label className="form-field form-field--short">{operation.kind === "payment" ? "Ödeme tutarı" : "Tutar"}<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          {operation.kind === "payment" && <label className="form-field form-field--medium">Ödeme yöntemi<select aria-label="Ödeme yöntemi" value={method} onChange={event => setMethod(event.target.value as RoomFolioPaymentMethod)}>
            <option value="cash">Nakit</option><option value="card">Kart</option><option value="bank">Banka</option><option value="other">Diğer</option>
          </select></label>}
        </>}
      {operation.kind !== "add-menu-item" && <ActionButton type="submit">{operation.kind === "payment" ? "Ödemeyi Kaydet" : operation.kind === "close-account" ? "Hesabı Kapat" : operation.kind === "void-payment" ? "Tahsilatı Geri Al" : "Kaydet"}</ActionButton>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
