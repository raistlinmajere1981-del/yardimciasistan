import { Plus, Search } from "lucide-react";
import type { MarketProductViewPreference } from "../../ui-preferences";
import { ActionButton } from "../ui/ActionButton";

export function MarketProductToolbar({ search, onSearch, view, onViewChange, onCreate, disabled }: {
  search: string;
  onSearch: (search: string) => void;
  view: MarketProductViewPreference;
  onViewChange: (view: MarketProductViewPreference) => void;
  onCreate: () => void;
  disabled: boolean;
}) {
  return <div className="market-product-toolbar">
    <div className="market-product-search-actions">
      <label className="market-search-field"><Search size={16} aria-hidden="true" /><input aria-label="Ürün ara" value={search} onChange={event => onSearch(event.target.value)} placeholder="Ürün adı, marka, SKU veya barkod ara" /></label>
      <ActionButton variant="secondary" size="sm" type="button" disabled={!search} onClick={() => onSearch("")}>Temizle</ActionButton>
      <ActionButton data-workspace-return-focus size="sm" type="button" disabled={disabled} onClick={onCreate}><Plus size={16} aria-hidden="true" /> Yeni ürün</ActionButton>
    </div>
    <div className="market-product-view-controls">
      <label className="form-check"><input type="checkbox" checked={view.showImages} onChange={event => onViewChange({ ...view, showImages: event.target.checked })} /> Resimleri göster</label>
      <select aria-label="Ürün görünümü" value={view.preset} onChange={event => onViewChange({ ...view, preset: event.target.value as MarketProductViewPreference["preset"] })}>
        <option value="comfortable">Rahat</option><option value="balanced">Dengeli</option><option value="dense">Yoğun</option><option value="list">Liste</option>
      </select>
    </div>
  </div>;
}
