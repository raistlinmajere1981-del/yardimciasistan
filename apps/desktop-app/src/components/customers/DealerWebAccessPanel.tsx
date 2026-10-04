import { useEffect, useState } from "react";
import type { DealerAccessAction, DealerWebAccess } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";
import { StatusBadge } from "../ui/StatusBadge";

export function DealerWebAccessPanel({ customerId, disabled }: { customerId: string; disabled: boolean }) {
  const [access, setAccess] = useState<DealerWebAccess | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDealerWebAccess) { setMessage("Web erişim durumu okunamadı."); return; }
    bridge.getDealerWebAccess(customerId).then((result) => { if (active) setAccess(result); })
      .catch(() => { if (active) setMessage("Web erişim durumu okunamadı."); });
    return () => { active = false; };
  }, [customerId]);
  async function change(action: DealerAccessAction) {
    setBusy(true); setInviteUrl(""); setMessage("");
    try {
      const result = await window.yardimciDesktop!.changeDealerWebAccess(customerId, action);
      setAccess(result.access); setInviteUrl(result.inviteUrl ?? "");
      setMessage("İşlem kaydedildi. Webe ulaşması için eşitlemenin tamamlanması gerekir.");
    } catch { setMessage("İşlem tamamlanamadı. Aktif bayi, Wholesale ve Servisler > Bayi Web Erişimi ayarlarını kontrol edin."); }
    finally { setBusy(false); }
  }
  const ready = access?.enabled && Date.parse(access.inviteExpiresAt) > Date.now();
  const status = !access ? "Kapalı" : !access.enabled ? (access.revokedAt ? "İptal edildi" : "Kapalı")
    : ready ? "Davet hazır" : "Erişim etkin";
  return <section className="panel customer-operation-card form-stack" aria-label="Web bayi erişimi">
    <div className="customer-operation-card__heading"><h3>Web bayi erişimi</h3><StatusBadge tone={access?.enabled ? "success" : "neutral"}>{status}</StatusBadge></div>
    <small>Bu işlemler hemen kaydedilir. Davet 72 saat geçerlidir; yalnız bu ekranda gösterilir. Davet yenileme eski oturumları da sonlandırır.</small>
    <div className="action-row">
      {!access?.enabled && <ActionButton disabled={disabled || busy} onClick={() => void change("enable")}>Web erişimini etkinleştir</ActionButton>}
      {access?.enabled && <>
        <ActionButton disabled={disabled || busy} onClick={() => void change("invite")}>{access.inviteIssuedAt ? "Daveti yenile" : "Davet oluştur"}</ActionButton>
        <ActionButton variant="secondary" disabled={disabled || busy} onClick={() => void change("revoke_sessions")}>Oturumları sonlandır</ActionButton>
        <ActionButton variant="danger" disabled={disabled || busy} onClick={() => void change("disable")}>Web erişimini kapat</ActionButton>
      </>}
    </div>
    {inviteUrl && <><label className="form-field"><span>Davet bağlantısı</span><input aria-label="Davet bağlantısı" readOnly value={inviteUrl} /></label>
      <ActionButton variant="secondary" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage("Davet bağlantısı kopyalandı.")).catch(() => setMessage("Bağlantıyı seçerek kopyalayabilirsiniz."))}>Davet bağlantısını kopyala</ActionButton></>}
    {disabled && <small>Önce müşteri kartındaki değişiklikleri kaydedin veya geri alın.</small>}
    {message && <p role="status">{message}</p>}
  </section>;
}
