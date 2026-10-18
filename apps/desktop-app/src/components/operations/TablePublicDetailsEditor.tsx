import { useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import {
  TABLE_PUBLIC_DETAIL_LIMITS,
  TABLE_PUBLIC_FEATURE_CATALOG,
  normalizeTablePublicFeatures,
  normalizeTableSmokingPolicy,
  type SaveTablePublicDetailsInput,
  type TablePublicFeatureId,
  type TableSmokingPolicy
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";

interface TablePublicDetailsEditorTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  description: string;
  features: TablePublicFeatureId[];
  smokingPolicy: TableSmokingPolicy;
}

interface TablePublicDetailsSaveResult {
  ok: boolean;
  message: string;
}

interface TablePublicDetailsEditorProps {
  dialogClassName?: string;
  open: boolean;
  table: TablePublicDetailsEditorTable | null;
  onClose: () => void;
  onSave: (input: SaveTablePublicDetailsInput) => Promise<TablePublicDetailsSaveResult>;
}

interface TablePublicDetailsFormState {
  capacity: string;
  description: string;
  features: TablePublicFeatureId[];
  smokingPolicy: TableSmokingPolicy;
}

function toForm(table: TablePublicDetailsEditorTable | null): TablePublicDetailsFormState {
  return {
    capacity: String(table?.capacity ?? 1),
    description: table?.description ?? "",
    features: normalizeTablePublicFeatures(table?.features ?? []),
    smokingPolicy: normalizeTableSmokingPolicy(table?.smokingPolicy)
  };
}

function toggleFeature(features: TablePublicFeatureId[], featureId: TablePublicFeatureId) {
  return features.includes(featureId)
    ? features.filter((value) => value !== featureId)
    : [...features, featureId];
}

export function TablePublicDetailsEditor({ open, table, onClose, onSave, dialogClassName }: TablePublicDetailsEditorProps) {
  const [form, setForm] = useState<TablePublicDetailsFormState>(() => toForm(table));
  const [saving, setSaving] = useState(false);
  const seededTableIdRef = useRef("");
  const capacity = useMemo(() => Number.parseInt(form.capacity, 10), [form.capacity]);
  const validCapacity = Number.isInteger(capacity) && capacity > 0 && capacity <= 100;

  useEffect(() => {
    if (!open || !table) {
      seededTableIdRef.current = "";
      return;
    }
    if (seededTableIdRef.current === table.id) return;
    seededTableIdRef.current = table.id;
    setForm(toForm(table));
    setSaving(false);
  }, [open, table]);

  if (!open || !table) return null;

  return (
    <FormDialog
      dialogClassName={dialogClassName ?? ""}
      title="Masa bilgilerini düzenle"
      onClose={() => {
        if (!saving) onClose();
      }}
      closeBlocked={saving || JSON.stringify(form) !== JSON.stringify(toForm(table))}
      dismissOnBackdrop
      onSubmit={(event) => void (async () => {
        event.preventDefault();
        if (!validCapacity || saving) return;
        setSaving(true);
        const result = await onSave({
          tableId: table.id,
          name: table.name,
          area: table.area,
          capacity,
          description: form.description.trim(),
          features: normalizeTablePublicFeatures(form.features),
          smokingPolicy: normalizeTableSmokingPolicy(form.smokingPolicy)
        });
        setSaving(false);
        if (result.ok) onClose();
      })()}
      footer={(
        <>
          {!validCapacity && (
            <p id="table-capacity-error" role="alert" className="form-status sync-error">
              Kapasite 1 ile 100 arasında olmalı.
            </p>
          )}
          <div className="action-row room-public-details-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Vazgeç
            </ActionButton>
            <ActionButton type="submit" disabled={!validCapacity || saving}>
              <Save size={16} aria-hidden="true" />
              {saving ? "Kaydediliyor" : "Kaydet"}
            </ActionButton>
          </div>
        </>
      )}
    >
      <div className="form-stack customer-create-form room-public-details-form">
        <section className="panel form-stack">
          <p className="settings-table-detail-context">{table.name}{table.area ? " · " + table.area : ""}</p>
          <div className="form-grid table-public-basic-grid">
            <label className="form-field form-field--xs">
              Kapasite
              <input
                autoFocus
                type="number"
                min={1}
                max={100}
                required
                aria-invalid={!validCapacity}
                aria-describedby={!validCapacity ? "table-capacity-error" : undefined}
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              />
            </label>
            <label className="form-field form-field--fluid table-public-description">
              Açıklama
              <textarea
                maxLength={TABLE_PUBLIC_DETAIL_LIMITS.description}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Müşteriye gösterilebilecek kısa masa açıklaması."
              />
            </label>
          </div>
        </section>

        <section className="panel form-stack">
          <fieldset className="room-public-features">
            <legend>Masa özellikleri</legend>
            <div className="page-toolbar__start">
              {TABLE_PUBLIC_FEATURE_CATALOG.map((feature) => (
                <label className="form-check" key={feature.id}>
                  <input
                    type="checkbox"
                    checked={form.features.includes(feature.id)}
                    onChange={() => setForm((current) => ({
                      ...current,
                      features: toggleFeature(current.features, feature.id)
                    }))}
                  />
                  {feature.label}
                </label>
              ))}
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={form.smokingPolicy === "smoking_allowed" || form.smokingPolicy === "outdoor_only"}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    smokingPolicy: event.target.checked ? "smoking_allowed" : "unspecified"
                  }))}
                />
                Sigara içiliyor
              </label>
            </div>
          </fieldset>
        </section>
      </div>
    </FormDialog>
  );
}
