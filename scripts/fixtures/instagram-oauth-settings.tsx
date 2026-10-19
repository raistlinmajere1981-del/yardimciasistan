import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { InstagramSettingsSection } from "../../apps/desktop-app/src/components/settings/MarketingChannelsSettingsSection";
import type { InstagramConfiguration } from "@yardimci-asistan/shared";
import { ServiceSettingsContext } from "../../apps/desktop-app/src/components/settings/ServiceSettingsCard";
import { GlobalMessageBar } from "../../apps/desktop-app/src/components/layout/GlobalMessageBar";
import { subscribeAppStatus, type AppStatusDetail } from "../../apps/desktop-app/src/app/runtime-state";
import type { SettingsOperationResult } from "../../apps/desktop-app/src/app/settings-save";
import "../../apps/desktop-app/src/styles/index.css";

const empty: InstagramConfiguration = {
  providerId: "instagram_api", enabled: false, accountId: "", username: "", expiresAt: "",
  apiVersion: "v25.0", hasSecret: false, configured: false
};
const state = {
  configuration: {...empty}, stage: "idle", beginCount: 0, pollCount: 0,
  disconnectCount: 0, cancelCount: 0, testCount: 0, saveCount: 0, hasPassedTest: false,
  draftEnabled: false, savedEnabled: false, error: ""
};
(window as unknown as {__igSettingsState: typeof state}).__igSettingsState = state;
Object.defineProperty(window, "yardimciDesktop", {
  configurable: true,
  value: {
    getInstagramConfiguration: async () => ({...state.configuration}),
    beginInstagramOAuth: async () => {
      state.beginCount++; state.stage="pending";
      return {ok:true,message:"Tarayıcıda Instagram girişini tamamlayın."};
    },
    pollInstagramOAuth: async () => {
      state.pollCount++;
      if(state.stage === "pending")return {status:"pending"};
      if(state.stage === "complete"){
        state.stage="idle";
        state.hasPassedTest=true; // Initial OAuth verifies the professional account.
        state.configuration={...empty, enabled:state.savedEnabled,hasSecret:true,configured:state.savedEnabled,
          accountId:"17800000000000000",username:"ornek_hesap",expiresAt:"2030-12-01T00:00:00Z"};
        return {status:"connected",username:"ornek_hesap"};
      }
      return {status:"failed",message:"Giriş tamamlanamadı."};
    },
    cancelInstagramOAuth: async () => {
      state.cancelCount++;state.stage="idle";
      return {ok:true,message:"Instagram giriş işlemi iptal edildi."};
    },
    disconnectInstagramOAuth: async () => {
      state.disconnectCount++;state.hasPassedTest=false;state.savedEnabled=false;
      state.configuration={...empty};
      return {...state.configuration};
    },
    testInstagramConnection: async () => {
      state.testCount++;
      const ok=Boolean(state.configuration.hasSecret);
      state.hasPassedTest=ok;
      return {ok,message:ok?"Instagram bağlantısı doğrulandı.":"Hesap bulunamadı.",testedAt:new Date().toISOString()};
    }
  }
});
function Fixture(){
  const [draft,setDraft]=useState<InstagramConfiguration>({...empty});
  const [persisted,setPersisted]=useState<InstagramConfiguration>({...empty});
  const [active,setActive]=useState<string|null>(null);
  const [status,setStatus]=useState<AppStatusDetail|null>(null);
  useEffect(()=>subscribeAppStatus(setStatus),[]);
  const change=(next:InstagramConfiguration)=>{state.draftEnabled=next.enabled;setDraft(next);};
  const save=():SettingsOperationResult=>{
    state.saveCount++;
    if(draft.enabled && !(state.configuration.hasSecret && state.hasPassedTest)){
      state.error="Instagram ayarlarını kaydetmeden önce bağlantıyı başarıyla test edin.";
      return {ok:false,message:state.error};
    }
    state.savedEnabled=draft.enabled;
    state.configuration={...state.configuration,enabled:draft.enabled,configured:draft.enabled && state.configuration.hasSecret};
    const next={...draft,enabled:draft.enabled};
    setPersisted(next);setDraft(next);state.error="";
    return {ok:true,changed:true,message:"Instagram kaydedildi."};
  };
  const revert=()=>{
    state.draftEnabled=persisted.enabled;setDraft({...persisted});
  };
  return <main style={{padding:30,maxWidth:760}}>
    {status && <GlobalMessageBar tone={status.state} message={status.message}/>}
    <ServiceSettingsContext.Provider value={{active,open:setActive,owner:()=>({
      dirty:draft.enabled!==persisted.enabled,savedEnabled:persisted.enabled,save,discard:revert
    })}}>
    <InstagramSettingsSection draft={draft} busy={false} onChange={change}/>
    </ServiceSettingsContext.Provider>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
