import { createRoot } from "react-dom/client";
import { InstagramSettingsSection } from "../../apps/desktop-app/src/components/settings/MarketingChannelsSettingsSection";
import "../../apps/desktop-app/src/styles/index.css";

const empty = {
  providerId: "instagram_api", enabled: false, accountId: "", username: "", expiresAt: "",
  apiVersion: "v25.0", hasSecret: false, configured: false
};
const state = {
  configuration: {...empty}, stage: "idle", beginCount: 0, pollCount: 0, disconnectCount: 0
};
(window as unknown as {__igSettingsState:typeof state}).__igSettingsState = state;
Object.defineProperty(window, "yardimciDesktop", {
  configurable: true,
  value: {
    getInstagramConfiguration: async () => ({...state.configuration}),
    beginInstagramOAuth: async () => {
      state.beginCount++; state.stage = "pending";
      return {ok: true, message: "Tarayıcıda Instagram girişini tamamlayın."};
    },
    pollInstagramOAuth: async () => {
      state.pollCount++;
      if (state.stage === "pending") return {status: "pending"};
      if (state.stage === "complete") {
        state.stage = "idle";
        state.configuration = {...empty, enabled:true, configured:true, hasSecret:true,
          accountId:"17800000000000000",username:"ornek_hesap", expiresAt:"2030-12-01T00:00:00Z"};
        return {status:"connected",username:"ornek_hesap"};
      }
      return {status:"failed",message:"Giriş tamamlanamadı."};
    },
    disconnectInstagramOAuth: async () => {
      state.disconnectCount++; state.configuration = {...empty};
      return {...state.configuration};
    },
    testInstagramConnection: async () => ({ok:true,message:"Instagram bağlantısı doğrulandı.",testedAt:new Date().toISOString()})
  }
});
createRoot(document.getElementById("root")!).render(<main style={{padding:30,maxWidth:760}}>
  <InstagramSettingsSection busy={false}/>
</main>);
