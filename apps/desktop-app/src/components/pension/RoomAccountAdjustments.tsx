import { useState } from "react";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { ChoiceChips } from "../ui/ChoiceChips";
import { DatePicker } from "../ui/DateTimePicker";
import { SearchSelect } from "../ui/SearchSelect";
import { minorMoney, minorToInput, parseMoneyToMinor } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomAccountAdjustments({ folio, controller, menuEnabled, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; menuEnabled: boolean; disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"manual_charge" | "discount">("manual_charge");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const item = controller.data.menuItems.find(item => item.id === itemId);
  return <section className="operation-section form-stack" aria-label="Hesaba ekle">
    <h4>Hesaba ekle · {folio.customerName}</h4>
    {menuEnabled && <form className="form-stack" onSubmit={event => {
      event.preventDefault();
      if (!item || (item.stockQuantity !== null && item.stockQuantity < item.stockConsumptionQuantity)) return;
      const existing = folio.items.find(line => line.kind === "menu" && line.menuItemId === item.id && !line.note.trim());
      void controller.mutate(() => existing ? window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: existing.id, quantity: existing.quantity + 1 })
        : window.yardimciDesktop!.addRoomFolioMenuItem({ folioId: folio.id, menuItemId: item.id, quantity: 1 }), "adjustments");
    }}>
      <fieldset className="form-stack" disabled={disabled}>
        <div className="form-field form-field--fluid">
          <span>Ürün / hizmet</span>
          <SearchSelect
            ariaLabel="Ürün / hizmet"
            value={itemId}
            onChange={setItemId}
            placeholder="Ürün seçin"
            searchPlaceholder="Ürün, kategori veya açıklama ara"
            options={controller.data.menuItems.map(item => ({
              id: item.id,
              label: item.name,
              description: `${item.categoryName || "Menü"} · ${minorMoney(item.priceMinor)}${item.stockQuantity === null ? "" : ` · Stok ${item.stockQuantity} ${item.stockUnit || ""}`}`,
              keywords: `${item.categoryName} ${item.description}`,
              disabled: item.stockQuantity !== null && item.stockQuantity < item.stockConsumptionQuantity
            }))}
          />
        </div>
        <ActionButton variant="secondary" type="submit" disabled={!item || (item.stockQuantity !== null && item.stockQuantity < item.stockConsumptionQuantity)}>Ürünü Ekle</ActionButton>
      </fieldset>
    </form>}
    <form className="form-stack" onChange={() => onDirty("charge", true)} onSubmit={event => {
      event.preventDefault(); setError(""); const value = parseMoneyToMinor(amount);
      if (value === null || value <= 0) { setError("Geçerli bir tutar girin."); return; }
      void controller.mutate(() => window.yardimciDesktop!.addRoomFolioManualItem({ folioId: folio.id, kind, label: label.trim(), amountMinor: value }), "adjustments")
        .then(result => { if (result?.ok) { setAmount(""); setLabel(""); onDirty("charge", false); } });
    }}>
      <fieldset className="form-stack" disabled={disabled}>
        <div className="operation-fields">
          <div className="form-field">
            <span>Kalem türü</span>
            <ChoiceChips
              ariaLabel="Kalem türü"
              value={kind}
              onChange={setKind}
              options={[{ id: "manual_charge", label: "Ek ücret" }, { id: "discount", label: "İndirim" }]}
            />
          </div>
          <label className="form-field">Tutar<MoneyInput required value={amount} onChange={setAmount} /></label>
        </div>
        <label className="form-field">Açıklama<input required value={label} onChange={event => setLabel(event.target.value)} /></label>
        <ActionButton variant="secondary" type="submit">Kalemi Kaydet</ActionButton>
      </fieldset>{error && <p role="alert">{error}</p>}
    </form>
  </section>;
}

export function RoomAccountDetails({ folio, controller, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const baseline = { guestCount: folio.guestCount, start: folio.checkInDate, end: folio.plannedCheckOutDate,
    nightly: minorToInput(folio.nightlyPriceMinor), manual: folio.lodgingManualOverride, total: minorToInput(folio.lodgingTotalMinor) };
  const [edits, setDraft] = useState<typeof baseline | null>(null);
  const draft = edits ?? baseline;
  const [error, setError] = useState("");
  return <form className="operation-section form-stack" aria-label="Konaklama ücreti" onChange={() => onDirty(true)} onSubmit={event => {
    event.preventDefault(); setError("");
    const nightly = parseMoneyToMinor(draft.nightly), total = parseMoneyToMinor(draft.total);
    if (nightly === null || nightly < 0 || (draft.manual && total === null)) { setError("Konaklama tutarlarını kontrol edin."); return; }
    void controller.mutate(() => window.yardimciDesktop!.updateRoomFolioDetails({ folioId: folio.id, guestCount: draft.guestCount, checkInDate: draft.start,
      plannedCheckOutDate: draft.end, nightlyPriceMinor: nightly, lodgingManualOverride: draft.manual, lodgingTotalMinor: draft.manual ? total ?? undefined : undefined }), "details")
      .then(result => { if (result?.ok) { setDraft(null); onDirty(false); } });
  }}>
    <h4>Konaklama ücreti</h4>
    <fieldset className="form-stack" disabled={disabled}>
      <div className="operation-fields">
        <div className="form-field">
          <span>Giriş tarihi</span>
          <DatePicker ariaLabel="Giriş tarihi" value={draft.start} disabled={disabled} clearable={false}
            onChange={start => { setDraft({ ...draft, start }); onDirty(true); }} />
        </div>
        <div className="form-field">
          <span>Çıkış tarihi</span>
          <DatePicker ariaLabel="Çıkış tarihi" value={draft.end} min={draft.start || undefined} disabled={disabled}
            onChange={end => { setDraft({ ...draft, end }); onDirty(true); }} />
        </div>
        <p>Kişi sayısı: {folio.guestCount} · Misafir listesinden yönetilir.</p>
        <label className="form-field">Gecelik fiyat<MoneyInput required value={draft.nightly} onChange={nightly => setDraft({ ...draft, nightly })} /></label>
      </div>
      <label className="form-check"><input type="checkbox" checked={draft.manual} onChange={event => setDraft({ ...draft, manual: event.target.checked })} />Toplamı elle belirle</label>
      <label className="form-field">Konaklama toplamı<MoneyInput disabled={!draft.manual} value={draft.total} onChange={total => setDraft({ ...draft, total })} /></label>
      <ActionButton variant="secondary" type="submit">Konaklama Ücretini Kaydet</ActionButton>
    </fieldset>{error && <p role="alert">{error}</p>}
  </form>;
}
