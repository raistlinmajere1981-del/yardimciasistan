import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SettingsActionPopover } from "./SettingsActionPopover";
import { UpdateSettings, type useUpdateSettings } from "./UpdateSettings";

export function SidebarUpdateStatus({ controller }: { controller: ReturnType<typeof useUpdateSettings> }) {
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
  return <SettingsActionPopover id="sidebar-updates" label="Güncellemeler" open={open} onOpenChange={onOpenChange} sidebar
    trigger={<><RefreshCw size={17} aria-hidden="true" /><span><small>{status?.currentVersion || "Sürüm bilinmiyor"}</small><small role="status">{text}</small></span></>}>
    <UpdateSettings controller={controller} />
  </SettingsActionPopover>;
}
