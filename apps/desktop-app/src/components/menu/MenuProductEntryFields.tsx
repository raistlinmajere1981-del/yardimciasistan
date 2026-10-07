import type { DesktopDashboardData } from "../../../electron/database";
import type { ItemFormState } from "./menu-model";
import { SearchSelect } from "../ui/SearchSelect";
import { MoneyInput } from "../ui/MoneyInput";
import { StatusChip } from "../ui/StatusChip";

export function MenuProductEntryFields({ form, dashboardData, qrMenuEnabled, inventoryEnabled, disabled = false, showAvailability = true, onChange }: {
  form: ItemFormState; dashboardData: DesktopDashboardData; qrMenuEnabled: boolean; inventoryEnabled: boolean;
  disabled?: boolean; showAvailability?: boolean; onChange: (form: ItemFormState) => void;
}) {
  return <section className="form-stack" aria-label="Menü sunumu">
    <h3>Menü sunumu</h3>
    <label className="form-field">Menü kategorisi<SearchSelect ariaLabel="Menü kategorisi" disabled={disabled} clearable={false}
      value={form.category_id} onChange={category_id => onChange({ ...form, category_id })}
      options={dashboardData.menu.categories.map(category => ({ id: category.id, label: category.name }))} /></label>
    <label className="form-field">Menü fiyatı (isteğe bağlı)<MoneyInput aria-label="Menü fiyatı" disabled={disabled}
      placeholder="Ürünün satış fiyatını kullan" value={form.price_override} onChange={price_override => onChange({ ...form, price_override })} />
      <small>Boş bırakılırsa satış fiyatı kullanılır.</small></label>
    <div className="action-row">
      {showAvailability && <StatusChip disabled={disabled} tone={form.is_available ? "success" : "neutral"} selected={form.is_available} onClick={() => onChange({ ...form, is_available: !form.is_available })}>Menüde mevcut</StatusChip>}
      <StatusChip disabled={disabled} tone="info" selected={form.is_featured} onClick={() => onChange({ ...form, is_featured: !form.is_featured })}>Öne çıkan</StatusChip>
    </div>
    <label className="form-field">Alerjenler<input disabled={disabled} value={form.allergens} onChange={event => onChange({ ...form, allergens: event.target.value })} /></label>
    <label className="form-field">Etiketler<input disabled={disabled} value={form.tags} onChange={event => onChange({ ...form, tags: event.target.value })} /></label>
    {inventoryEnabled && <label className="form-field">Satış başına stok tüketimi<input disabled={disabled} inputMode="decimal" value={form.stock_consumption_quantity} onChange={event => onChange({ ...form, stock_consumption_quantity: event.target.value })} /><small>Ürünün stok birimi kullanılır.</small></label>}
    {inventoryEnabled && qrMenuEnabled && <label className="form-check"><input disabled={disabled} type="checkbox" checked={form.hide_when_out_of_stock} onChange={event => onChange({ ...form, hide_when_out_of_stock: event.target.checked })} /> Stokta yokken QR menüden gizle</label>}
  </section>;
}
