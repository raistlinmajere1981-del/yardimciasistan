import { useEffect, useRef, useState } from "react";
import { useSettingsConnectionTest } from "../../app/use-settings-connection-test";
import { type InstagramConfiguration, type MarketingProviderConnectionResult } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { ActionButton } from "../ui/ActionButton";
export function SmsSettingsSection({draft,busy,onChange}:{draft:SetupFormState["sms"];busy:boolean;onChange:(draft:SetupFormState["sms"])=>void}) {
  const connection=useSettingsConnectionTest<MarketingProviderConnectionResult & { connectionVerified?: boolean }>(draft);
  const {testing,result}=connection;
  const [senders,setSenders]=useState<string[]>([]);
  const change=(patch:Partial<typeof draft>)=>{connection.clear();onChange({...draft,...patch});};
  const complete=Boolean(draft.senderId && (draft.apiKey || draft.hasApiKey&&!draft.clearApiKey) && (draft.apiHash || draft.hasApiHash&&!draft.clearApiHash));
  async function test(refresh=false) {
    const bridge=window.yardimciDesktop;if(!bridge)return;
    await connection.run(async () => {
      try { if(refresh){const value=await bridge.listSmsSenderIds(draft);if(value.ok)setSenders(value.value);return {ok:value.ok,message:value.ok?"Başlık listesi yenilendi.":value.message,testedAt:new Date().toISOString()};}
        const value=await bridge.testSmsConnection(draft);if(value.senderIds)setSenders(value.senderIds);return {...value,connectionVerified:value.ok};
      } catch{return {ok:false,message:"Bağlantı testi tamamlanamadı.",testedAt:new Date().toISOString()};}
    });
  }
  return <ServiceSettingsCard id="settings-marketing-sms" title="SMS / İleti Merkezi" readiness={testing ? "Kontrol ediliyor…" : result && !result.ok ? "Hata" : result?.connectionVerified ? "Hazır" : "Test edilmedi"} testMessage={result?.message ?? ""} enabled={draft.enabled} disabled={busy||testing}
    status={complete?"Yapılandırılmış":"Hesap bilgileri eksik"} onEnabledChange={enabled=>change({enabled})}>
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

  </ServiceSettingsCard>;
}
/** Instagram credentials live in the OAuth owner; activation lives in staged Settings. */
export function InstagramSettingsSection({draft,busy,onChange}:{
  draft:SetupFormState["instagram"];busy:boolean;onChange:(value:SetupFormState["instagram"])=>void
}) {
  const [account,setAccount]=useState<InstagramConfiguration>(draft);
  const [waiting,setWaiting]=useState(false);
  const [starting,setStarting]=useState(false);
  const [working,setWorking]=useState(false);
  const [confirmDisconnect,setConfirmDisconnect]=useState(false);
  const [message,setMessage]=useState("");
  const [messageError,setMessageError]=useState(false);
  const [testResult,setTestResult]=useState<MarketingProviderConnectionResult|null>(null);
  const polling=useRef(false);
  const attempt=useRef(0);

  useEffect(()=>{
    let active=true;
    void window.yardimciDesktop?.getInstagramConfiguration().then(value=>{if(active)setAccount(value);})
      .catch(()=>{if(active){setMessage("Instagram bağlantı durumu okunamadı.");setMessageError(true);}});
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!waiting)return;
    let stopped=false;
    const currentAttempt=attempt.current;
    const timer=window.setInterval(()=>{
      if(polling.current||stopped)return;
      polling.current=true;
      void window.yardimciDesktop!.pollInstagramOAuth().then(async result=>{
        if(stopped||currentAttempt!==attempt.current)return;
        if(result.status==="pending")return;
        setWaiting(false);
        if(result.status==="connected"){
          const next=await window.yardimciDesktop!.getInstagramConfiguration();
          if(stopped||currentAttempt!==attempt.current)return;
          setAccount(next);
          setMessage("");
          setTestResult(null);
        } else {setMessage(result.message);setMessageError(true);}
      }).catch(()=>{
        if(!stopped&&currentAttempt===attempt.current){
          setWaiting(false);setMessage("Bağlantı kontrolü tamamlanamadı. Yeniden bağlanmayı deneyin.");setMessageError(true);
        }
      }).finally(()=>{polling.current=false;});
    },2500);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[waiting]);

  async function begin(){
    if(busy||working||waiting||starting||!draft.enabled)return;
    const currentAttempt=++attempt.current;
    setStarting(true);setMessage("");setMessageError(false);setTestResult(null);setConfirmDisconnect(false);
    try {
      const result=await window.yardimciDesktop!.beginInstagramOAuth();
      if(currentAttempt!==attempt.current)return;
      setMessage(result.message);setMessageError(!result.ok);setWaiting(result.ok);
    } catch {
      if(currentAttempt===attempt.current){setMessage("Instagram giriş işlemi başlatılamadı.");setMessageError(true);}
    } finally {if(currentAttempt===attempt.current)setStarting(false);}
  }

  /** Cancel the unfinished browser handshake, NOT an already linked Instagram account. */
  async function cancelPending(silent=false){
    if(!waiting&&!starting)return;
    ++attempt.current; // Ignore any poll result that arrives after cancellation.
    setWaiting(false);
    setStarting(false);
    setTestResult(null);
    setConfirmDisconnect(false);
    setWorking(true);
    if(!silent){setMessage("Instagram giriş işlemi iptal ediliyor…");setMessageError(false);}
    try {
      const result=await window.yardimciDesktop!.cancelInstagramOAuth();
      if(!silent){setMessage(result.message);setMessageError(!result.ok);}
    } catch {
      if(!silent){setMessage("Giriş işlemi iptal edilemedi. Tekrar deneyin.");setMessageError(true);}
    } finally {setWorking(false);}
  }

  async function disconnect(){
    if(!confirmDisconnect){setConfirmDisconnect(true);return;}
    setWorking(true);
    try {
      const next=await window.yardimciDesktop!.disconnectInstagramOAuth();
      setAccount(next);
      onChange({...draft,enabled:false});
      setMessage("Instagram bağlantısı kesildi.");setMessageError(false);setTestResult(null);
    } catch {setMessage("Instagram bağlantısı kesilemedi.");setMessageError(true);}
    finally {setWorking(false);setConfirmDisconnect(false);}
  }
  async function test(){
    setWorking(true);setTestResult(null);setMessage("");setMessageError(false);
    try {setTestResult(await window.yardimciDesktop!.testInstagramConnection());}
    catch {setMessage("Instagram bağlantısı test edilemedi.");setMessageError(true);}
    finally {setWorking(false);}
  }
  const linked=Boolean(account.hasSecret && account.accountId && account.username);
  const legacy=Boolean(account.hasSecret && account.accountId && !account.username);
  return <ServiceSettingsCard id="settings-marketing-instagram" title="Instagram"
    readiness={working || waiting || starting ? "Kontrol ediliyor…" : testResult ? testResult.ok ? "Hazır" : "Hata" : "Test edilmedi"}
    testMessage={testResult?.message ?? message}
    messageState={testResult ? testResult.ok ? "success" : "error" : messageError ? "error" : waiting ? "loading" : "success"}
    enabled={draft.enabled} disabled={busy||working}
    toggleDisabled={waiting||starting} saveDisabled={waiting||starting} onDialogClose={()=>{if(waiting||starting)void cancelPending(true);}}
    onEnabledChange={enabled=>{setMessage("");setTestResult(null);setConfirmDisconnect(false);onChange({...draft,enabled});}}
    status={linked?"":"Hesap bağlantısı gerekli"}>
    {linked && <p role="status"><strong>@{account.username}</strong> · Paylaşım izni etkin
      {account.expiresAt?` · Erişim: ${new Date(account.expiresAt).toLocaleDateString("tr-TR")}`:""}</p>}
    {legacy && <p role="status">Önceki manuel bağlantı bulundu. Instagram ile yeniden bağlayın.</p>}
    {!linked && !legacy && <p>Paylaşımı etkinleştirmek için Instagram hesabını bağlayıp bağlantıyı test edin.</p>}
    {waiting && <p role="status">Instagram girişini tarayıcıda tamamlayın. Bağlantı bekleniyor.</p>}
    <div className="action-row">
      {waiting||starting ? <ActionButton variant="secondary" disabled={busy||working} onClick={()=>void cancelPending()}>
        Bağlantıyı İptal Et
      </ActionButton> : <ActionButton disabled={busy||working} busy={working} onClick={()=>void begin()}>
        {linked||legacy?"Hesabı yeniden bağla":"Instagram ile bağlan"}
      </ActionButton>}
      {linked && <ActionButton variant="secondary" disabled={busy||working||waiting||starting}
        onClick={()=>void test()}>Bağlantıyı test et</ActionButton>}
      {(linked||legacy) && <ActionButton variant="secondary" disabled={busy||working||waiting||starting}
        onClick={()=>void disconnect()}>
        {confirmDisconnect?"Bağlantıyı kesmeyi onayla":"Bağlantıyı kes"}
      </ActionButton>}
    </div>
    {confirmDisconnect && <p role="alert">Bağlantıyı keserseniz Instagram'a planlanmış yayınlar yeniden bağlanana kadar gönderilemez.</p>}
    {message && <p role="status">{message}</p>}
  </ServiceSettingsCard>;
}
