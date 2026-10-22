import { useEffect, useState } from "react";
import type { DealerAccessAction, DealerWebAccess } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";
import { StatusBadge } from "../ui/StatusBadge";

export function DealerWebAccessPanel({ customerId, disabled, active = true }: { customerId: string; disabled: boolean; active?: boolean }) {
  const [access, setAccess] = useState<DealerWebAccess | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDealerWebAccess) { setMessage("Web erişim durumu okunamadı."); return; }
    bridge.getDealerWebAccess(customerId).then((result) => { if (active) { setAccess(result); setInviteUrl(""); setConfirmLogout(false); } })
      .catch(() => { if (active) setMessage("Web erişim durumu okunamadı."); });
    return () => { active = false; };
  }, [customerId, active]);
  async function change(action: DealerAccessAction) {
    setConfirmLogout(false); setBusy(true); setInviteUrl(""); setMessage("");
    try {
      const result = await window.yardimciDesktop!.changeDealerWebAccess(customerId, action);
      setAccess(result.access); setInviteUrl(result.inviteUrl ?? "");
      setMessage("İşlem kaydedildi. Webe ulaşması için eşitlemenin tamamlanması gerekir.");
    } catch { setMessage("İşlem tamamlanamadı. Aktif bayi, Wholesale ve Servisler > Bayi Web Erişimi ayarlarını kontrol edin."); }
    finally { setBusy(false); }
  }
  const ready = access?.enabled && Date.parse(access.inviteExpiresAt) > Date.now();
  return <section className="panel customer-operation-card form-stack" aria-label="Bayi Girişi">
    <div className="customer-operation-card__heading"><h3>Bayi Girişi</h3><StatusBadge tone={active ? "success" : "neutral"}>{active ? ready ? "Davet hazır" : "Aktif" : "Pasif"}</StatusBadge></div>
    {!active ? <p>Bayi pasif — online erişim kapalı</p> : <>
      <div className="action-row">
        <ActionButton disabled={disabled || busy} onClick={() => void change("invite")}>{access?.inviteIssuedAt ? "Yeni davet oluştur" : "Davet oluştur"}</ActionButton>
        <ActionButton variant="secondary" disabled={disabled || busy} onClick={() => setConfirmLogout(true)}>Tüm cihazlardan çıkış yap</ActionButton>
      </div>
      {confirmLogout && <div role="alert" className="form-stack"><p>Web ve Android oturumları kapatılacak, kullanılmamış davetler iptal edilecek.</p><div className="action-row">
        <ActionButton variant="danger" disabled={busy} onClick={() => void change("revoke_sessions")}>Çıkış yap</ActionButton>
        <ActionButton variant="secondary" onClick={() => setConfirmLogout(false)}>Vazgeç</ActionButton>
      </div></div>}
    </>}
    {active && inviteUrl && <><label className="form-field"><span>Davet bağlantısı</span><input aria-label="Davet bağlantısı" readOnly value={inviteUrl} /></label>
      <ActionButton variant="secondary" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage("Davet bağlantısı kopyalandı.")).catch(() => setMessage("Bağlantıyı seçerek kopyalayabilirsiniz."))}>Davet bağlantısını kopyala</ActionButton></>}
    {disabled && <small>Önce müşteri kartındaki değişiklikleri kaydedin veya geri alın.</small>}
    {message && <p role="status">{message}</p>}
  </section>;
}
