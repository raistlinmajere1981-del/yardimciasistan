import { useCallback, useEffect, useRef, useState } from "react";
import type { MessagingConsentStatus, MessagingChannel } from "@yardimci-asistan/shared";
import { useWorkspaceCloseGuard } from "../workspace/WorkspaceNavigation";

export function CustomerMessagingPreferences({ customerId, disabled, onBusyChange }: { customerId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [statuses, setStatuses] = useState<Record<MessagingChannel,MessagingConsentStatus>>({whatsapp:"unknown",sms:"unknown"});
  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const invalidateRequest = useCallback(() => { ++request.current; }, []);
  useWorkspaceCloseGuard({ busy, dirty: false, scope: { entityType: "customer", entityId: customerId } });
  const refresh = useCallback(async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.getCustomerMessagingPreference) return;
    const ticket = ++request.current;
    setReady(false);
    try {
      // Marketing consent belongs to an enabled delivery service; dormant services have no surface.
      const [business, sms] = await Promise.all([
        bridge.getBusinessMessagingConfiguration?.().catch(() => null),
        bridge.getSmsConfiguration?.().catch(() => null)
      ]);
      const active: MessagingChannel[] = [];
      if (business?.enabled) active.push("whatsapp");
      if (sms?.enabled) active.push("sms");
      if (ticket !== request.current) return;
      setChannels(active);
      if (!active.length) { setMessage(""); return; }
      const results = await Promise.all(active.map(channel => bridge.getCustomerMessagingPreference(customerId, channel, "marketing")));
      if (ticket !== request.current) return;
      if (results.some(r => !r.ok)) { setMessage("İletişim tercihleri okunamadı."); return; }
      setStatuses(current => {
        const next = {...current};
        results.forEach((result, i) => {if (result.ok) next[active[i]!] = result.value.status;});
        return next;
      });
      setMessage("");
      setReady(true);
    } catch {if (ticket === request.current) setMessage("İletişim tercihi okunamadı.");}
  }, [customerId]);
  useEffect(() => {
    let active = true;
    // On configuration change the existing component remains mounted; the channel selection is recomputed.
    const update = () => {if(active) void refresh();};
    update();
    const off = window.yardimciDesktop?.onBusinessMessagingChanged?.(update);
    return () => {active = false; invalidateRequest(); off?.();};
  }, [refresh, invalidateRequest]);
  async function change(channel: MessagingChannel, next: MessagingConsentStatus) {
    if (!channels.includes(channel)) return;
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      const result = await window.yardimciDesktop!.saveCustomerMessagingPreference({ customerId, channel, purpose: "marketing", status: next, source: "customer_workspace" });
      if (result.ok) { setStatuses(current => ({...current,[channel]:result.value.status})); setMessage("Pazarlama tercihi kaydedildi."); }
      else setMessage(result.message);
    } catch { setMessage("İletişim tercihi kaydedilemedi."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  if (!channels.length) return null;
  return <section className="panel customer-operation-card form-stack" aria-label="İletişim tercihleri">
    <h3>İletişim tercihleri</h3>
    {channels.map(channel => <label className="form-field" key={channel}><span>{channel === "whatsapp" ? "WhatsApp" : "SMS"} pazarlama</span>
      <select value={statuses[channel]} disabled={!ready || disabled || busy} onChange={event => void change(channel,event.target.value as MessagingConsentStatus)}>
        <option value="unknown">Bilinmiyor</option><option value="opted_in">İzinli</option><option value="opted_out">İzin vermiyor</option>
      </select>
    </label>)}
    <small>Pazarlama izinleri her etkin kanal için ayrı kaydedilir. Yalnız kampanyaların uygunluğunu belirler; tekil mesaj işlemleri ayrı yürür. Hukuki uyumluluk garantisi değildir.</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
