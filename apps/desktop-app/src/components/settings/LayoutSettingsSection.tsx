import { Plus, Trash2 } from "lucide-react";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type BusinessCapability } from "@yardimci-asistan/shared";
import { nextTableCategoryFormKey, type SetupFormState } from "../../app/setup-model";
import { ActionButton } from "../ui/ActionButton";

type LayoutSettingsForm = Pick<SetupFormState, "roomCount" | "tableCategories">;

interface LayoutSettingsSectionProps {
  form: Readonly<LayoutSettingsForm>;
  onFormChange: (patch: Partial<LayoutSettingsForm>) => void;
  enabledCapabilities: readonly BusinessCapability[];
}

export function LayoutSettingsSection({ form, onFormChange, enabledCapabilities }: LayoutSettingsSectionProps) {
  const update = <Key extends keyof LayoutSettingsForm,>(key: Key, value: LayoutSettingsForm[Key]) => {
    onFormChange({ [key]: value } as Partial<LayoutSettingsForm>);
  };
  const updateTableCategory = (key: string, field: "name" | "tableCount", value: string) => {
    update("tableCategories", form.tableCategories.map((category) =>
      category.key === key ? { ...category, [field]: value } : category
    ));
  };

  const addTableCategory = () => {
    update("tableCategories", [
      ...form.tableCategories,
      {
        key: nextTableCategoryFormKey(),
        sourceName: "",
        name: "",
        tableCount: "1"
      }
    ]);
  };

  const removeTableCategory = (key: string) => {
    update("tableCategories", form.tableCategories.filter((category) => category.key !== key));
  };

  const tableCountTotal = form.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
  const accommodationEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  );
  const foodServiceEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.FOOD_TABLES
  );

  return (
        <div id="settings-operations" tabIndex={-1} className="setup-section settings-daily-section">
          {accommodationEnabled && <div className="setup-count-row settings-room-count">
            <label className="form-field form-field--xs">
              Oda sayısı
              <input value={form.roomCount} onChange={(event) => update("roomCount", event.target.value)} inputMode="numeric" min="0" step="1" type="number" />
            </label>
          </div>}
          {foodServiceEnabled && <div className="table-category-editor">
            <div className="table-category-heading">
              <div>
                <strong>Masa kategorileri</strong>
              </div>
              <span>{tableCountTotal} masa</span>
            </div>
            {form.tableCategories.length > 0 && (
              <div className="table-category-list">
                {form.tableCategories.map((category, index) => (
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
            <ActionButton variant="secondary" size="sm" className="table-category-add" type="button" onClick={addTableCategory}>
              <Plus size={15} aria-hidden="true" />
              Kategori Ekle
            </ActionButton>
          </div>}
        </div>
  );
}
