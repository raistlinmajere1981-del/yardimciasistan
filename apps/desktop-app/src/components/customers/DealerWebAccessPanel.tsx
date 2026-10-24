import { useEffect, useState } from "react";
import type { DealerAccessAction, DealerWebAccess } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";
import { StatusBadge } from "../ui/StatusBadge";

export function DealerWebAccessPanel({ customerId, disabled, active = true }: { customerId: string; disabled: boolean; active?: boolean }) {
  const [access, setAccess] = useState<DealerWebAccess | null>(null);
  const [confirm, setConfirm] = useState<DealerAccessAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  useEffect(() => {
    let current = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDealerWebAccess) { setMessage("Hesap durumu okunamadı."); return; }
    bridge.getDealerWebAccess(customerId).then(result => { if (current) { setAccess(result); setConfirm(null); } })
      .catch(() => { if (current) setMessage("Hesap durumu okunamadı."); });
    return () => { current = false; };
  }, [customerId, active]);
  async function change(action: DealerAccessAction) {
    setConfirm(null); setBusy(true); setMessage("");
    try {
      const result = await window.yardimciDesktop!.changeDealerWebAccess(customerId, action);
      setAccess(result.access); setMessage("Kaydedildi. Sunucuya uygulanması için eşitlemenin tamamlanması gerekiyor.");
    } catch { setMessage("İşlem tamamlanamadı. Hesap başka bir müşteriyle eşleştirilmiş olabilir."); }
    finally { setBusy(false); }
  }
  return <section className="panel customer-operation-card form-stack" aria-label="Müşteri Hesabı">
    <div className="customer-operation-card__heading"><h3>Müşteri Hesabı</h3><StatusBadge tone={access?.accountId ? "success" : "neutral"}>{access?.accountId ? "Bağlı" : "Hesap bekleniyor"}</StatusBadge></div>
    <p>Müşteri webden hesap oluşturabilir. Bayi statüsü ve fiyat grubu bu müşteri kartından yönetilir.</p>
    {access?.accountId && <><p>{access.enabled ? "Bayi erişimi açık." : "Normal müşteri hesabı. Bayi erişimi için Online Satış, Bayi / Toptan Satış ve bayi portalı açık olmalı."}</p>
      <ActionButton variant="secondary" disabled={disabled || busy} onClick={() => setConfirm("revoke_sessions")}>Tüm cihazlardan çıkış yap</ActionButton></>}
    {!access?.accountId && access?.linkCandidates.map(candidate => <div key={candidate.accountId} className="form-stack">
      <p>{candidate.fullName} · {candidate.email} — doğrulanmış hesap, eşleştirme bekliyor.</p>
      <ActionButton disabled={disabled || busy} onClick={() => setConfirm({ type: "link", accountId: candidate.accountId })}>Bu müşteriyle eşleştir</ActionButton>
    </div>)}
    {confirm && <div role="alert" className="form-stack"><p>{confirm === "revoke_sessions" ? "Bu hesaba ait tüm web ve Android oturumları eşitleme sonrasında kapatılacak." : "Hesap sahibinin bu müşteri olduğunu doğrulayın. Bağlantı bayi fiyatlarına ve müşterinin siparişlerine erişim verebilir."}</p><div className="action-row">
      <ActionButton variant="danger" disabled={busy} onClick={() => void change(confirm)}>Onayla</ActionButton>
      <ActionButton variant="secondary" onClick={() => setConfirm(null)}>Vazgeç</ActionButton>
    </div></div>}
    {disabled && <small>Önce müşteri kartındaki değişiklikleri kaydedin veya geri alın.</small>}
    {message && <p role="status">{message}</p>}
  </section>;
}
