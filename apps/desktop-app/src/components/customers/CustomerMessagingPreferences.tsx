import { useEffect, useState } from "react";
import type { MessagingConsentStatus } from "@yardimci-asistan/shared";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";

export function CustomerMessagingPreferences({ customerId, disabled, onBusyChange }: { customerId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState<MessagingConsentStatus>("unknown");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getCustomerMessagingPreference) return;
    bridge.getCustomerMessagingPreference(customerId, "whatsapp", "marketing").then((result) => {
      if (!active) return;
      if (result.ok) { setStatus(result.value.status); setReady(true); }
      else setMessage(result.message);
    }).catch(() => { if (active) setMessage("İletişim tercihi okunamadı."); });
    return () => { active = false; };
  }, [customerId]);
  async function change(next: MessagingConsentStatus) {
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      const result = await window.yardimciDesktop!.saveCustomerMessagingPreference({ customerId, channel: "whatsapp", purpose: "marketing", status: next, source: "customer_workspace" });
      if (result.ok) { setStatus(result.value.status); setMessage("Pazarlama tercihi kaydedildi."); }
      else setMessage(result.message);
    } catch { setMessage("İletişim tercihi kaydedilemedi."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="panel customer-operation-card form-stack" aria-label="İletişim tercihleri">
    <h3>İletişim tercihleri</h3>
    <label className="form-field"><span>WhatsApp pazarlama</span>
      <select value={status} disabled={!ready || disabled || busy} onChange={(event) => void change(event.target.value as MessagingConsentStatus)}>
        <option value="unknown">Bilinmiyor</option><option value="opted_in">İzinli</option><option value="opted_out">İzin vermiyor</option>
      </select>
    </label>
    <small>Hemen kaydedilir. Yalnız pazarlama kampanyalarının uygunluğunu belirler. Tekil WhatsApp işlemleri kendi akışını kullanır. Hukuki uyumluluk garantisi değildir.</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
