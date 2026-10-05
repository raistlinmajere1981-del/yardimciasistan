import { useEffect, useState } from "react";
import type { MessagingConsentStatus, MessagingChannel } from "@yardimci-asistan/shared";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";

export function CustomerMessagingPreferences({ customerId, disabled, onBusyChange }: { customerId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [statuses, setStatuses] = useState<Record<MessagingChannel,MessagingConsentStatus>>({whatsapp:"unknown",sms:"unknown"});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getCustomerMessagingPreference) return;
    setReady(false);
    Promise.all([bridge.getCustomerMessagingPreference(customerId,"whatsapp","marketing"),bridge.getCustomerMessagingPreference(customerId,"sms","marketing")]).then(results=>{
      if(!active)return;
      if(results[0].ok && results[1].ok){setStatuses({whatsapp:results[0].value.status,sms:results[1].value.status});setReady(true);}
      else setMessage("İletişim tercihleri okunamadı.");
    }).catch(()=>{if(active)setMessage("İletişim tercihi okunamadı.");});
    return () => { active = false; };
  }, [customerId]);
  async function change(channel: MessagingChannel, next: MessagingConsentStatus) {
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      const result = await window.yardimciDesktop!.saveCustomerMessagingPreference({ customerId, channel, purpose: "marketing", status: next, source: "customer_workspace" });
      if (result.ok) { setStatuses(current=>({...current,[channel]:result.value.status})); setMessage("Pazarlama tercihi kaydedildi."); }
      else setMessage(result.message);
    } catch { setMessage("İletişim tercihi kaydedilemedi."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="panel customer-operation-card form-stack" aria-label="İletişim tercihleri">
    <h3>İletişim tercihleri</h3>
    {(["whatsapp","sms"] as const).map(channel=><label className="form-field" key={channel}><span>{channel==="whatsapp"?"WhatsApp":"SMS"} pazarlama</span>
      <select value={statuses[channel]} disabled={!ready || disabled || busy} onChange={event=>void change(channel,event.target.value as MessagingConsentStatus)}>
        <option value="unknown">Bilinmiyor</option><option value="opted_in">İzinli</option><option value="opted_out">İzin vermiyor</option>
      </select>
    </label>)}
    <small>WhatsApp ve SMS izinleri bağımsızdır. Hemen kaydedilir. Yalnız pazarlama kampanyalarının uygunluğunu belirler. Tekil WhatsApp işlemleri kendi akışını kullanır. Hukuki uyumluluk garantisi değildir.</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
