import { ServiceSettingsCard } from "./ServiceSettingsCard";
import { useEffect, useState } from "react";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { RefreshCw } from "lucide-react";
import type { SetupFormState } from "../../app/setup-model";
import type { SetupFieldsProps } from "./setup-fields";
import type { SyncState } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
export function WebSettingsSection({ form, onFormChange }: SetupFieldsProps) {
  const beginTest = useRequestGeneration();
  const [webConnectionTestState, setWebConnectionTestState] = useState<SyncState>("idle");
  const [webConnectionTestMessage, setWebConnectionTestMessage] = useState("Web bağlantısı henüz denenmedi.");

  useEffect(() => {
    beginTest();
    setWebConnectionTestState("idle");
    setWebConnectionTestMessage("Web bağlantısı henüz denenmedi.");
  }, [beginTest, form.webModuleUrl, form.syncSecret]);

  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const testWebConnection = async () => {
    const isCurrent = beginTest();
    const baseUrl = form.webModuleUrl.trim().replace(/\/+$/, "");
    const syncSecret = form.syncSecret.trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web eşitleme adresi http:// veya https:// ile başlamalı.");
      return;
    }
    if (syncSecret.length < 12) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web güvenlik anahtarı en az 12 karakter olmalı.");
      return;
    }

    const bridge = window.yardimciDesktop;
    if (!bridge?.testWebConnection) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web bağlantı kontrolü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setWebConnectionTestState("loading");
    setWebConnectionTestMessage("Web modülüne bağlanılıyor...");
    try {
      const result = await bridge.testWebConnection({ baseUrl, syncSecret });
      if (!isCurrent()) return;
      setWebConnectionTestState(result.ok ? "success" : "error");
      setWebConnectionTestMessage(result.message);
    } catch {
      if (!isCurrent()) return;
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web bağlantısı kontrol edilemedi. Uygulamayı yeniden başlatıp tekrar deneyin.");
    }
  };

  return (
        <ServiceSettingsCard id="settings-web" title="Website / Web Modülü" enabled={form.autoSyncEnabled}
          toggleLabel="Otomatik eşitle" onEnabledChange={enabled => update("autoSyncEnabled", enabled)} showBody
          status={webConnectionTestState === "success" ? "Bağlantı doğrulandı"
            : webConnectionTestState === "error" ? "Bağlantı doğrulanmadı"
              : !form.autoSyncEnabled ? "Otomatik eşitleme kapalı"
                : form.webModuleUrl.trim() && form.syncSecret.trim().length >= 12 ? "Bağlantı ayarlı" : "Bağlantı ayarları gerekli"}>
          <div className="form-grid">
            <label className="form-field form-field--long form-field--span setup-field">
              Web eşitleme adresi
              <input value={form.webModuleUrl} onChange={(event) => update("webModuleUrl", event.target.value)} placeholder="https://yardimciasistan.alwaysdata.net/yardimci-asistan" />
            </label>
            <label className="form-field form-field--medium">
              Web güvenlik anahtarı
              <input
                value={form.syncSecret}
                onChange={(event) => update("syncSecret", event.target.value)}
                placeholder="uzun-gizli-anahtar"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
          </div>
          <div id="settings-web-test" tabIndex={-1} className={`setup-ai-actions is-inline setup-web-actions sync-${webConnectionTestState}`}>
            <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={() => void testWebConnection()} disabled={webConnectionTestState === "loading"}>
              <RefreshCw size={16} aria-hidden="true" />
              {webConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Web Bağlantısını Dene"}
            </ActionButton>
            <span className="setup-connection-message" role={webConnectionTestState === "error" ? "alert" : "status"} aria-live="polite">{webConnectionTestMessage}</span>
          </div>
        </ServiceSettingsCard>

  );
}
