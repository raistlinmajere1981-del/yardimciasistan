import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  getTableSmokingPolicyLabel,
} from "@yardimci-asistan/shared";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { useWebAvailability } from "../../app/web-availability";
import { ActionButton } from "../ui/ActionButton";
import { ResourceManagementWorkspace } from "./ResourceManagementWorkspace";
import { TableMediaPanel } from "./TableMediaPanel";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

export function LayoutSettingsSection({ controller, onEditTable }: { controller: BusinessLayoutController; onEditTable: (id: string) => void }) {
  const webAvailable = useWebAvailability();
  const [mediaTableKey, setMediaTableKey] = useState("");
  const {
    draft,
    loading,
    saving,
    updatePublication,
    updateTableCategory,
    addTableCategory,
    removeTableCategory,
    tableMediaRevision,
    reportTableMediaDirty
  } = controller;

  useEffect(() => {
    if (draft.tables.length === 0) {
      setMediaTableKey("");
      return;
    }
    if (!draft.tables.some((table) => table.key === mediaTableKey)) {
      const first = draft.tables[0];
      if (first) setMediaTableKey(first.key);
    }
  }, [draft.tables, mediaTableKey]);

  const tableCountTotal = draft.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
  const mediaTable = draft.tables.find((table) => table.key === mediaTableKey) ?? draft.tables[0] ?? null;

  return (
      <ResourceManagementWorkspace
        id="settings-operations"
        className="table-resource-workspace"
        title="Masa Yönetimi"
        subtitle={`Restoran · ${tableCountTotal} masa`}
        publishChecked={draft.publication.tables}
        publishAriaLabel="Masa web yayını"
        disabled={loading || saving}
        onPublishChange={(tables) => updatePublication({ tables })}
        actions={<ActionButton variant="secondary" size="sm" type="button" disabled={loading || saving} onClick={addTableCategory}><Plus size={15} aria-hidden="true" />Kategori Ekle</ActionButton>}
        media={
          <TableMediaPanel
            table={mediaTable ? {
              id: mediaTable.id,
              key: mediaTable.key,
              name: mediaTable.name,
              area: mediaTable.area
            } : null}
            embedded
            disabled={loading || saving}
            revision={tableMediaRevision}
            onDirtyChange={reportTableMediaDirty}
          />
        }
      >
        <fieldset className="settings-resource-fields table-management-fields" disabled={loading || saving}>
          {draft.tableCategories.length > 0 ? (
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
          ) : (
            <p className="table-category-empty">Henüz masa kategorisi yok.</p>
          )}

          <section className="resource-management-subsection">
            <div className="resource-management-subsection-heading">
              <div>
                <h3>Masa bilgileri</h3>
                <p>Kapasite ve müşteriye gösterilecek detaylar</p>
              </div>
            </div>

            {draft.tables.length === 0 ? (
              <p className="table-category-empty">
                Kategorileri kaydedince oluşan masalar burada listelenir.
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
                {draft.tables.map((table) => {
                  const selected = webAvailable && mediaTable?.key === table.key;
                  return (
                    <div
                      className={`table-public-resource-row${webAvailable ? " interactive-surface interactive-surface--record" : ""}${selected ? " is-media-selected is-selected" : ""}`}
                      key={table.key}
                      onClick={() => { if (webAvailable) setMediaTableKey(table.key); }}
                    >
                      <strong>{table.name}</strong>
                      <span>{table.area || "—"}</span>
                      <span>{table.capacity} kişi</span>
                      <span>
                        {table.smokingPolicy === "unspecified"
                          ? "Belirtilmedi"
                          : getTableSmokingPolicyLabel(table.smokingPolicy)}
                      </span>
                      <ActionButton
                        variant="link"
                        size="sm"
                        type="button"
                        className="room-management-details-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMediaTableKey(table.key);
                          onEditTable(table.key);
                        }}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Detaylar
                      </ActionButton>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </fieldset>
      </ResourceManagementWorkspace>
  );
}
