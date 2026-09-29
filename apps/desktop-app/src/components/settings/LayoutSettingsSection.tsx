import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  getTableSmokingPolicyLabel,
  type SaveTablePublicDetailsInput
} from "@yardimci-asistan/shared";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { TablePublicDetailsEditor } from "../operations/TablePublicDetailsEditor";
import { ActionButton } from "../ui/ActionButton";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

export function LayoutSettingsSection({ controller }: { controller: BusinessLayoutController }) {
  const [editingTableId, setEditingTableId] = useState("");
  const {
    draft,
    loading,
    saving,
    updateTable,
    updateTableCategory,
    addTableCategory,
    removeTableCategory
  } = controller;

  if (!draft.capabilities.tables) return null;

  const tableCountTotal = draft.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
  const editingTable = useMemo(
    () => draft.tables.find((table) => table.id === editingTableId) ?? null,
    [draft.tables, editingTableId]
  );

  return (
    <section id="settings-operations" tabIndex={-1} className="settings-daily-section table-layout-settings">
      <div className="settings-panel">
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
      </div>

      <div className="settings-panel">
        <div className="settings-panel-header table-public-heading">
          <div>
            <h2>Masa bilgileri</h2>
            <p>Kapasite ve müşteriye gösterilecek detaylar</p>
          </div>
        </div>
        <fieldset className="settings-resource-fields settings-panel-body" disabled={loading || saving}>
          {draft.tables.length === 0 ? (
            <p className="table-category-empty">
              Önce masa kategorilerini kaydedin. Oluşan masaların detayları burada düzenlenir.
            </p>
          ) : (
            <div className="table-public-resource-list" aria-label="Masa müşteri bilgileri">
              <div className="table-public-resource-head">
                <span>Masa</span>
                <span>Bölüm</span>
                <span>Kapasite</span>
                <span>Sigara</span>
                <span aria-hidden="true" />
              </div>
              {draft.tables.map((table) => (
                <div className="table-public-resource-row" key={table.key}>
                  <strong>{table.name}</strong>
                  <span>{table.area || "—"}</span>
                  <span>{table.capacity} kişi</span>
                  <span>{table.smokingPolicy === "unspecified" ? "Belirtilmedi" : getTableSmokingPolicyLabel(table.smokingPolicy)}</span>
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => setEditingTableId(table.id)}
                  >
                    Detaylar
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      </div>

      <TablePublicDetailsEditor
        open={Boolean(editingTable)}
        table={editingTable}
        onClose={() => setEditingTableId("")}
        onSave={async (input: SaveTablePublicDetailsInput) => {
          const table = draft.tables.find((candidate) => candidate.id === input.tableId);
          if (!table) return { ok: false, message: "Masa bulunamadı." };
          updateTable(table.key, {
            capacity: input.capacity,
            description: input.description,
            features: input.features,
            smokingPolicy: input.smokingPolicy
          });
          return { ok: true, message: "Masa detayları taslağa uygulandı." };
        }}
      />
    </section>
  );
}
