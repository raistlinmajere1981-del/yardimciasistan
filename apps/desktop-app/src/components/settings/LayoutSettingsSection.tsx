import { Plus, Trash2 } from "lucide-react";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { ActionButton } from "../ui/ActionButton";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

export function LayoutSettingsSection({ controller }: { controller: BusinessLayoutController }) {
  const {
    draft,
    loading,
    saving,
    updateTableCategory,
    addTableCategory,
    removeTableCategory
  } = controller;

  if (!draft.capabilities.tables) return null;

  const tableCountTotal = draft.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);

  return (
    <section id="settings-operations" tabIndex={-1} className="settings-panel settings-daily-section">
      <fieldset className="settings-resource-fields table-category-editor" disabled={loading || saving}>
          <div className="settings-panel-header table-category-heading">
            <div>
              <h2>Masa kategorileri</h2>
              <p>{tableCountTotal} masa</p>
            </div>
            <ActionButton
              variant="secondary"
              size="sm"
              className="table-category-add"
              type="button"
              onClick={addTableCategory}
            >
              <Plus size={15} aria-hidden="true" />
              Kategori Ekle
            </ActionButton>
          </div>

          <div className="settings-panel-body">
          {draft.tableCategories.length > 0 && (
            <div className="table-category-list">
              {draft.tableCategories.map((category, index) => (
                <div className="table-category-row" key={category.key}>
                  <label className="form-field form-field--medium">
                    <span>Kategori adı</span>
                    <input
                      value={category.name}
                      onChange={(event) => updateTableCategory(category.key, "name", event.target.value)}
                      placeholder={index === 0 ? "Örn. Salon" : "Örn. Bahçe"}
                      maxLength={50}
                    />
                  </label>
                  <label className="form-field form-field--xs table-category-count">
                    <span>Masa</span>
                    <input
                      value={category.tableCount}
                      onChange={(event) => updateTableCategory(category.key, "tableCount", event.target.value)}
                      inputMode="numeric"
                      min="1"
                      max="200"
                      step="1"
                      type="number"
                    />
                  </label>
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    className="table-category-remove"
                    type="button"
                    onClick={() => removeTableCategory(category.key)}
                    aria-label={`${category.name || `${index + 1}. kategori`} satırını kaldır`}
                    title="Kategoriyi kaldır"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
          </div>
      </fieldset>
    </section>
  );
}
