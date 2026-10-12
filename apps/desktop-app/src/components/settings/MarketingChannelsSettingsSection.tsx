import { useEffect, useRef, useState } from "react";
import { useSettingsConnectionTest } from "../../app/use-settings-connection-test";
import { type InstagramConfiguration, type MarketingProviderConnectionResult } from "@yardimci-asistan/shared";
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
/** OAuth connection is saved immediately by the main process, independently of staged Settings. */
export function InstagramSettingsSection({busy}:{busy:boolean}) {
  const [config,setConfig]=useState<InstagramConfiguration|null>(null);
  const [waiting,setWaiting]=useState(false);
  const [working,setWorking]=useState(false);
  const [confirmDisconnect,setConfirmDisconnect]=useState(false);
  const [message,setMessage]=useState("");
  const [testResult,setTestResult]=useState<MarketingProviderConnectionResult|null>(null);
  const polling=useRef(false);
  useEffect(()=>{
    let live=true;
    void window.yardimciDesktop?.getInstagramConfiguration().then(value=>{if(live)setConfig(value);})
      .catch(()=>{if(live)setMessage("Instagram bağlantı durumu okunamadı.");});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!waiting)return;
    let stopped=false;
    const timer=window.setInterval(()=>{
      if(polling.current||stopped)return;
      polling.current=true;
      void window.yardimciDesktop!.pollInstagramOAuth().then(async result=>{
        if(stopped)return;
        if(result.status==="pending")return;
        setWaiting(false);
        if(result.status==="connected") {
          setConfig(await window.yardimciDesktop!.getInstagramConfiguration());
          setMessage(`Instagram @${result.username} bağlandı.`);
        } else setMessage(result.message);
      }).catch(()=>{if(!stopped){setWaiting(false);setMessage("Bağlantı kontrolü tamamlanamadı. Yeniden bağlanmayı deneyin.");}})
        .finally(()=>{polling.current=false;});
    },2500);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[waiting]);
  async function begin() {
    if(working||waiting||busy)return;
    setWorking(true);setMessage("");setTestResult(null);setConfirmDisconnect(false);
    try {
      const result=await window.yardimciDesktop!.beginInstagramOAuth();
      setMessage(result.message);setWaiting(result.ok);
    } catch {setMessage("Instagram giriş işlemi başlatılamadı.");}
    finally {setWorking(false);}
  }
  async function disconnect() {
    if(!confirmDisconnect){setConfirmDisconnect(true);return;}
    setWorking(true);
    try {
      setConfig(await window.yardimciDesktop!.disconnectInstagramOAuth());
      setMessage("Instagram bağlantısı kesildi.");setTestResult(null);
    } catch {setMessage("Instagram bağlantısı kesilemedi.");}
    finally {setWorking(false);setConfirmDisconnect(false);}
  }
  async function test() {
    setWorking(true);setTestResult(null);
    try {const result=await window.yardimciDesktop!.testInstagramConnection();setTestResult(result);}
    catch {setMessage("Instagram bağlantısı test edilemedi.");}
    finally {setWorking(false);}
  }
  const linked=Boolean(config?.configured && config.username);
  const legacy=Boolean(config?.configured && !config.username);
  return <ServiceSettingsCard id="settings-marketing-instagram" title="Instagram" enabled
    status={linked?`Bağlı · @${config?.username}`:legacy?"Önceki bağlantı · Yeniden bağlayın":"Bağlı değil"}>
    <p>Instagram Business veya Creator hesabınızı tarayıcıdan giriş yaparak bağlayın. User ID ve erişim anahtarı girmeniz gerekmez.</p>
    {linked && <p role="status"><strong>@{config?.username}</strong> · Paylaşım izni etkin{config?.expiresAt?` · Erişim: ${new Date(config.expiresAt).toLocaleDateString("tr-TR")}`:""}</p>}
    {legacy && <p role="status">Önceki manuel bağlantı bulundu. Yeni bağlantı kurulduğunda eski erişim anahtarı otomatik değiştirilir.</p>}
    {waiting && <p role="status">Instagram girişini tarayıcıda tamamlayın. Bağlantı bekleniyor; bu sayfadan ayrılırsanız daha sonra tekrar bağlanabilirsiniz.</p>}
    <div className="action-row">
      <ActionButton disabled={busy||working||waiting} busy={working} onClick={()=>void begin()}>
        {linked||legacy?"Hesabı yeniden bağla":"Instagram ile bağlan"}
      </ActionButton>
      {linked && <ActionButton variant="secondary" disabled={busy||working||waiting} onClick={()=>void test()}>Bağlantıyı test et</ActionButton>}
      {(linked||legacy) && <ActionButton variant="secondary" disabled={busy||working||waiting} onClick={()=>void disconnect()}>
        {confirmDisconnect?"Bağlantıyı kesmeyi onayla":"Bağlantıyı kes"}
      </ActionButton>}
    </div>
    {confirmDisconnect && <p role="alert">Bağlantıyı keserseniz Instagram'a planlanmış yayınlar yeniden bağlanana kadar gönderilemez.</p>}
    {message && <p role="status">{message}</p>}
    {testResult && <p role="status">{testResult.ok?"Başarılı":"Başarısız"} · {testResult.message}</p>}
    <p>Görsel yayınlamak için HTTPS Web Modülü bağlantısı gereklidir.</p>
  </ServiceSettingsCard>;
}
