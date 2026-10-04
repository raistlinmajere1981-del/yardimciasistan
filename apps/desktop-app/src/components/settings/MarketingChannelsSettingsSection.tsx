import { useEffect, useState } from "react";
import type { MarketingChannelRegistry } from "@yardimci-asistan/shared";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
/** D5 adapters will own their fields; planned channels never acquire generic credential inputs. */
export function MarketingChannelsSettingsSection() {
  const [channels,setChannels]=useState<MarketingChannelRegistry>([]);
  useEffect(()=>{let live=true;void window.yardimciDesktop?.getMarketingChannels?.().then(r=>{if(live && r.ok)setChannels(r.value);}).catch(()=>{});return()=>{live=false;};},[]);
  return <>{channels.filter(c=>c.id==="sms"||c.id==="instagram").map(c=><ServiceSettingsCard key={c.id} id={`settings-marketing-${c.id}`} title={c.displayName}
    enabled={false} status="Yayın bağlantısı sonraki aşamada (D5)" disabled><p>Sağlayıcı bağlantısı henüz desteklenmiyor.</p></ServiceSettingsCard>)}</>;
}
