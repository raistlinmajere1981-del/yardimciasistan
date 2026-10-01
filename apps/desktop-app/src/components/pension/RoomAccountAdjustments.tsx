import { useState } from "react";
import type { PublishedMenuItem, PublishedQrMenu } from "@yardimci-asistan/sync-core";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { MenuProductPicker } from "../menu/MenuProductPicker";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { minorMoney, parseMoneyToMinor } from "./folio-format";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomAccountAdjustments({ folio, controller, menu, webModuleUrl, menuEnabled, inventoryEnabled, disabled, onDirty }: {
  folio: DesktopRoomFolio; controller: RoomFolioController; menu: PublishedQrMenu; webModuleUrl: string;
  menuEnabled: boolean; inventoryEnabled: boolean; disabled: boolean;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const visibleItems = folio.items.filter(item => item.kind !== "discount");

  function roomMenuItem(item: PublishedMenuItem) {
    return controller.data.menuItems.find(candidate => candidate.id === item.id);
  }

  function canAddMenuItem(item: PublishedMenuItem) {
    const source = roomMenuItem(item);
    return Boolean(source && (!inventoryEnabled || source.stockQuantity === null || source.stockQuantity >= source.stockConsumptionQuantity));
  }

  function addMenuItem(item: PublishedMenuItem) {
    const source = roomMenuItem(item);
    if (!source || !canAddMenuItem(item)) return;
    const existing = folio.items.find(line => line.kind === "menu" && line.menuItemId === source.id && !line.note.trim());
    return controller.mutate(() => existing
      ? window.yardimciDesktop!.updateRoomFolioItemQuantity({ itemId: existing.id, quantity: existing.quantity + 1 })
      : window.yardimciDesktop!.addRoomFolioMenuItem({ folioId: folio.id, menuItemId: source.id, quantity: 1 }), "adjustments");
  }

  return <section className="operation-section form-stack" aria-label="Hesaba ekle">
    <h4>Hesaba ekle · {folio.customerName}</h4>
    <MenuProductPicker
      menu={menu}
      webModuleUrl={webModuleUrl}
      enabled={menuEnabled}
      inventoryEnabled={inventoryEnabled}
      busy={disabled}
      panelAriaLabel="Oda hesabı menüsü"
      searchAriaLabel="Oda hesabı için ürün ara"
      addAriaLabel={item => `${item.name} ürününü oda hesabına ekle`}
      canAddItem={canAddMenuItem}
      onAddItem={addMenuItem}
      className="room-folio-menu-panel"
    />
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
