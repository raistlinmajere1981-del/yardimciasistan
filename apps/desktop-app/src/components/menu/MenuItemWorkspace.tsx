import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { toItemForm, type ItemFormState } from "./menu-model";
import { MenuItemFormFields } from "./MenuItemFormFields";
import type { MenuItemWorkspaceIntent } from "../workspace/workspace-intent";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";

type SaveState = "idle" | "loading" | "success" | "error";

export interface MenuItemWorkspaceProps {
  intent: MenuItemWorkspaceIntent;
  data: DesktopDashboardData;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
  onSave: (form: ItemFormState) => Promise<DesktopMenuSaveResult | undefined>;
  onDelete: (itemId: string) => Promise<DesktopStatusUpdateResult | undefined>;
}

export function MenuItemWorkspace({
  intent,
  data,
  qrMenuEnabled,
  inventoryEnabled,
  onSave,
  onDelete
}: MenuItemWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const item = data.menu.items.find((record) => record.id === intent.entityId);
  const fallbackCategoryId = data.menu.categories[0]?.id || "";
  const initial = toItemForm(item, fallbackCategoryId);
  const [form, setForm] = useState<ItemFormState>(initial);
  const [baseline, setBaseline] = useState<ItemFormState>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("Değişiklikler kaydedilene kadar yalnız bu çalışma alanında tutulur.");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const closeBlocked = useWorkspaceCloseGuard({ busy: saveState === "loading", dirty });
  const presentation = navigation.current?.presentation || "centered";

  if (!item) {
    return (
      <WorkspaceFrame
        title="Menü ürünü bulunamadı"
        context="Kayıt yenilenmiş veya silinmiş olabilir."
        presentation={presentation}
        onPresentationChange={navigation.updateWorkspacePresentation}
        onClose={navigation.closeWorkspace}
        closeBlocked={closeBlocked}
        returnFocusRef={navigation.returnFocusRef}
        dismissOnBackdrop
      >
        <div className="empty-state">
          <strong>Menü ürünü artık kullanılamıyor.</strong>
          <p>Çalışma alanını kapatıp menü listesini yenileyin.</p>
        </div>
      </WorkspaceFrame>
    );
  }

  const categoryName = data.menu.categories.find((category) => category.id === item.category_id)?.name || "Kategori yok";

  async function save() {
    setSaveState("loading");
    setSaveMessage("Ürün kaydediliyor...");
    const result = await onSave(form);
    if (!result) {
      setSaveState("error");
      setSaveMessage("Ürün kaydedilemedi. Uygulamayı yeniden başlatın.");
      return;
    }
    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      return;
    }
    const saved = result.dashboardData.menu.items.find((record) => record.id === result.savedId);
    const next = toItemForm(saved, result.dashboardData.menu.categories[0]?.id || fallbackCategoryId);
    setForm(next);
    setBaseline(next);
    setSaveState("success");
    setSaveMessage(result.message);
  }

  const itemId = item.id;

  async function remove() {
    setSaveState("loading");
    setSaveMessage("Ürün siliniyor...");
    const result = await onDelete(itemId);
    if (!result) {
      setSaveState("error");
      setSaveMessage("Ürün silinemedi. Uygulamayı yeniden başlatın.");
      setDeleteConfirm(false);
      return;
    }
    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      setDeleteConfirm(false);
      return;
    }
    setDeleteConfirm(false);
    navigation.closeWorkspace();
  }

  return (
    <WorkspaceFrame
        title={item.name}
        context={categoryName + " · " + item.price + " " + item.currency}
        actions={<StatusBadge tone={item.is_available ? "success" : "neutral"}>{item.is_available ? "Mevcut" : "Kapalı"}</StatusBadge>}
        presentation={presentation}
        onPresentationChange={navigation.updateWorkspacePresentation}
        onClose={navigation.closeWorkspace}
        closeBlocked={closeBlocked}
        returnFocusRef={navigation.returnFocusRef}
        dismissOnBackdrop
        footer={deleteConfirm ? (
          <ConfirmDialog embedded tone="danger" title={`“${item.name}” menüden silinecek.`}
            description="Bu işlem geri alınamaz." confirmLabel="Ürünü sil" busy={saveState === "loading"}
            onCancel={() => setDeleteConfirm(false)} onConfirm={remove} />
        ) : (
          <>
            <p className={"form-status sync-" + saveState} role="status" aria-live="polite">{saveMessage}</p>
            <div className="action-row">
              <ActionButton variant="danger" type="button" disabled={saveState === "loading" || dirty} onClick={() => setDeleteConfirm(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Ürünü Sil
              </ActionButton>
              <ActionButton variant="secondary" type="button" disabled={saveState === "loading" || !dirty} onClick={() => {
                setForm(baseline);
                setSaveState("idle");
                setSaveMessage("Kaydedilmemiş değişiklikler geri alındı.");
              }}>
                Değişiklikleri Geri Al
              </ActionButton>
              <ActionButton type="button" disabled={saveState === "loading" || !dirty} onClick={() => void save()}>
                <Save size={16} aria-hidden="true" />
                {saveState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}
              </ActionButton>
            </div>
          </>
        )}
      >
      <div className="menu-item-workspace-form">
        <MenuItemFormFields
          mode="all"
          form={form}
          dashboardData={data}
          qrMenuEnabled={qrMenuEnabled}
          inventoryEnabled={inventoryEnabled}
          onChange={setForm}
        />
      </div>
    </WorkspaceFrame>
  );
}
