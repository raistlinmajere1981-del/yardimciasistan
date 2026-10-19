import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SettingsActionPopover } from "./SettingsActionPopover";
import { UpdateSettings, type useUpdateSettings } from "./UpdateSettings";

export function HeaderUpdateStatus({ controller }: { controller: ReturnType<typeof useUpdateSettings> }) {
  const [open, setOpen] = useState(false);
  const onOpenChange = useCallback((value: boolean) => setOpen(value), []);
  const { status, action, error } = controller;
  const text = error || status?.phase === "error" ? "Güncelleme hatası"
    : action === "check" || status?.phase === "checking" ? "Kontrol ediliyor"
    : status?.phase === "downloading" ? `İndiriliyor · %${status.progressPercent}`
    : controller.updateReady ? "Kuruluma hazır"
    : controller.updateAvailable ? "Güncelleme var"
    : status?.phase === "up-to-date" && status.lastCheckedAt ? "Güncel"
    : status?.phase === "unsupported" ? "Güncelleme desteklenmiyor"
    : "Henüz kontrol edilmedi";
  const attention = error || status?.phase === "error" ? "error"
    : controller.updateReady || controller.updateAvailable ? "available"
    : status?.phase === "downloading" ? "progress" : "";
  return <SettingsActionPopover id="header-updates" label="Güncellemeler" open={open} onOpenChange={onOpenChange} iconButton
    trigger={<>
      <span className={`header-update-indicator${attention ? ` header-update-indicator--${attention}` : ""}`}>
        <RefreshCw size={18} aria-hidden="true" />
      </span>
      <span className="header-update-visually-hidden" role="status">{status?.currentVersion || "Sürüm bilinmiyor"} · {text}</span>
    </>}>
    <UpdateSettings controller={controller} />
  </SettingsActionPopover>;
}
