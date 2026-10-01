import { useState } from "react";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { SearchSelect } from "../ui/SearchSelect";
import { minorMoney, parseMoneyToMinor } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomAccountAdjustments({ folio, controller, menuEnabled, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; menuEnabled: boolean; disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const item = controller.data.menuItems.find(item => item.id === itemId);
  const visibleItems = folio.items.filter(item => item.kind !== "discount");
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
        <div className="room-inline-action-row">
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
        </div>
      </fieldset>
    </form>}
    <form className="form-stack" onChange={() => onDirty("charge", true)} onSubmit={event => {
      event.preventDefault(); setError(""); const value = parseMoneyToMinor(amount);
      if (value === null || value <= 0) { setError("Geçerli bir tutar girin."); return; }
      void controller.mutate(() => window.yardimciDesktop!.addRoomFolioManualItem({ folioId: folio.id, kind: "manual_charge", label: label.trim(), amountMinor: value }), "adjustments")
        .then(result => { if (result?.ok) { setAmount(""); setLabel(""); onDirty("charge", false); } });
    }}>
      <fieldset className="form-stack" disabled={disabled}>
        <div className="room-inline-action-row room-inline-action-row--charge">
          <label className="form-field room-money-field">Ek ücret<MoneyInput required value={amount} onChange={setAmount} /></label>
          <label className="form-field form-field--fluid">Açıklama<input required value={label} onChange={event => setLabel(event.target.value)} /></label>
          <ActionButton variant="secondary" type="submit">Ek Ücreti Ekle</ActionButton>
        </div>
      </fieldset>{error && <p role="alert">{error}</p>}
    </form>
    {visibleItems.length > 0 && <div className="room-folio-line-list" aria-label="Odaya eklenenler">
      {visibleItems.map(item => <article key={item.id}>
        <div>
          <strong>{item.label}</strong>
          <span>{item.kind === "menu" ? `${item.quantity} adet · ${minorMoney(item.unitPriceMinor)}` : "Ek ücret"}</span>
        </div>
        <b>{minorMoney(item.lineTotalMinor)}</b>
        <div className="action-row">
          {item.kind === "menu" && menuEnabled && <>
            <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını azalt`} onClick={() => void controller.mutate(() => item.quantity <= 1
              ? window.yardimciDesktop!.removeRoomFolioItem(item.id)
              : window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity - 1 }))}>−</ActionButton>
            <ActionButton variant="secondary" disabled={disabled} aria-label={`${item.label} miktarını artır`} onClick={() => void controller.mutate(() =>
              window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: item.id, quantity: item.quantity + 1 }))}>+</ActionButton>
          </>}
          <ActionButton variant="danger" disabled={disabled} aria-label={`${item.label} kalemini çıkar`} onClick={() =>
            void controller.mutate(() => window.yardimciDesktop!.removeRoomFolioItem(item.id))}>Çıkar</ActionButton>
        </div>
      </article>)}
    </div>}
  </section>;
}
