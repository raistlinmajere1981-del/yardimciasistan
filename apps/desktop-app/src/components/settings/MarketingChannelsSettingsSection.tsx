import { useState } from "react";
import { useSettingsConnectionTest } from "../../app/use-settings-connection-test";
import { INSTAGRAM_API_VERSION, type MarketingProviderConnectionResult } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { ActionButton } from "../ui/ActionButton";
export function SmsSettingsSection({draft,busy,onChange}:{draft:SetupFormState["sms"];busy:boolean;onChange:(draft:SetupFormState["sms"])=>void}) {
  const connection=useSettingsConnectionTest<MarketingProviderConnectionResult>(draft);
  const {testing,result}=connection;
  const [senders,setSenders]=useState<string[]>([]);
  const change=(patch:Partial<typeof draft>)=>{connection.clear();onChange({...draft,...patch});};
  const complete=Boolean(draft.senderId && (draft.apiKey || draft.hasApiKey&&!draft.clearApiKey) && (draft.apiHash || draft.hasApiHash&&!draft.clearApiHash));
  async function test(refresh=false) {
    const bridge=window.yardimciDesktop;if(!bridge)return;
    await connection.run(async () => {
      try { if(refresh){const value=await bridge.listSmsSenderIds(draft);if(value.ok)setSenders(value.value);return {ok:value.ok,message:value.ok?"Başlık listesi yenilendi.":value.message,testedAt:new Date().toISOString()};}
        const value=await bridge.testSmsConnection(draft);if(value.senderIds)setSenders(value.senderIds);return value;
      } catch{return {ok:false,message:"Bağlantı testi tamamlanamadı.",testedAt:new Date().toISOString()};}
    });
  }
  return <ServiceSettingsCard id="settings-marketing-sms" title="SMS / İleti Merkezi" enabled={draft.enabled} disabled={busy||testing}
    status={!draft.enabled?"Kapalı":complete?"Etkin · Yapılandırılmış":"Etkin · Yapılandırılmamış"} onEnabledChange={enabled=>change({enabled})}>
    <div className="form-grid">
      <label className="form-field">API Key<input aria-label="SMS API Key" type="password" autoComplete="new-password" maxLength={4096} value={draft.apiKey??""} placeholder={draft.hasApiKey?"Kayıtlı anahtarı değiştirmek için girin":"API Key"} onChange={e=>change({apiKey:e.target.value,clearApiKey:false})}/></label>
      <label className="form-field">API Hash<input aria-label="SMS API Hash" type="password" autoComplete="new-password" maxLength={4096} value={draft.apiHash??""} placeholder={draft.hasApiHash?"Kayıtlı hash'i değiştirmek için girin":"API Hash"} onChange={e=>change({apiHash:e.target.value,clearApiHash:false})}/></label>
      <label className="form-field">Sender ID / Başlık<input aria-label="SMS Sender ID" maxLength={11} list="sms-sender-ids" value={draft.senderId} onChange={e=>change({senderId:e.target.value})}/><datalist id="sms-sender-ids">{senders.map(sender=><option key={sender} value={sender}/>)}</datalist></label>
      <label className="form-field">İYS alıcı listesi<select value={draft.iysList} onChange={e=>change({iysList:e.target.value as typeof draft.iysList})}><option value="BIREYSEL">Bireysel</option><option value="TACIR">Tacir</option></select><small>Gönderilen kitlenin İYS alıcı türüyle eşleşmelidir.</small></label>
    </div>
    {draft.hasApiKey && <label className="form-check"><input type="checkbox" checked={Boolean(draft.clearApiKey)} onChange={e=>change({clearApiKey:e.target.checked,apiKey:""})}/>Kayıtlı API Key'i kaldır</label>}
    {draft.hasApiHash && <label className="form-check"><input type="checkbox" checked={Boolean(draft.clearApiHash)} onChange={e=>change({clearApiHash:e.target.checked,apiHash:""})}/>Kayıtlı API Hash'i kaldır</label>}
    <p>Test bakiye ve onaylı başlığı sorgular. Yerel SMS izni ve sağlayıcı İYS kontrolü gönderimde ayrı ayrı uygulanır.</p>
    <div className="action-row"><ActionButton variant="secondary" disabled={busy||testing||!complete} busy={testing} onClick={()=>void test()}>Bağlantıyı test et</ActionButton>
      <ActionButton variant="secondary" disabled={busy||testing||!complete} onClick={()=>void test(true)}>Başlık listesini yenile</ActionButton></div>
    {result && <p role="status">{result.ok?"Başarılı":"Başarısız"} · {result.message} · {new Date(result.testedAt).toLocaleString("tr-TR")}</p>}
  </ServiceSettingsCard>;
}
export function InstagramSettingsSection({draft,busy,onChange}:{draft:SetupFormState["instagram"];busy:boolean;onChange:(draft:SetupFormState["instagram"])=>void}) {
  const connection=useSettingsConnectionTest<MarketingProviderConnectionResult>(draft);
  const {testing,result}=connection;
  const change=(patch:Partial<typeof draft>)=>{connection.clear();onChange({...draft,...patch});};
  const complete=Boolean(draft.accountId && (draft.accessToken || draft.hasSecret&&!draft.clearAccessToken));
  async function test(){const bridge=window.yardimciDesktop;if(!bridge)return;await connection.run(async()=>{try{return await bridge.testInstagramConnection(draft);}catch{return {ok:false,message:"Bağlantı testi tamamlanamadı.",testedAt:new Date().toISOString()};}});}
  return <ServiceSettingsCard id="settings-marketing-instagram" title="Instagram" enabled={draft.enabled} disabled={busy||testing} onEnabledChange={enabled=>change({enabled})}
    status={!draft.enabled?"Kapalı":complete?"Etkin · Yapılandırılmış":"Etkin · Yapılandırılmamış"}>
    <label className="form-field">Instagram hesap / User ID<input aria-label="Instagram User ID" inputMode="numeric" maxLength={40} value={draft.accountId} onChange={e=>change({accountId:e.target.value})}/></label>
    <label className="form-field">Access Token<input aria-label="Instagram Access Token" type="password" autoComplete="new-password" maxLength={4096} value={draft.accessToken??""} placeholder={draft.hasSecret?"Kayıtlı anahtarı değiştirmek için girin":"Instagram User access token"} onChange={e=>change({accessToken:e.target.value,clearAccessToken:false})}/></label>
    {draft.hasSecret && <label className="form-check"><input type="checkbox" checked={Boolean(draft.clearAccessToken)} onChange={e=>change({clearAccessToken:e.target.checked,accessToken:""})}/>Kayıtlı erişim anahtarını kaldır</label>}
    <p>Instagram Login · Business / Creator · API {INSTAGRAM_API_VERSION}. Token izinleri: instagram_business_basic ve instagram_business_content_publish.</p>
    <p>Görsel aktarımı için HTTPS Web Modülü gerekir. Test yalnız hesap bilgisini okur.</p>
    <ActionButton variant="secondary" disabled={busy||testing||!complete} busy={testing} onClick={()=>void test()}>Bağlantıyı test et</ActionButton>
    {result && <p role="status">{result.ok?"Başarılı":"Başarısız"} · {result.message}{result.accountType?` · ${result.accountType}`:""} · {new Date(result.testedAt).toLocaleString("tr-TR")}</p>}
  </ServiceSettingsCard>;
}
