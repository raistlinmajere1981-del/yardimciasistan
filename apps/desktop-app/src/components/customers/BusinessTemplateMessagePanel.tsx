import { SearchSelect } from "../ui/SearchSelect";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessMessage, BusinessMessageTemplate } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
const statusLabels = { draft: "Hazır", queued: "Sağlayıcı sonucu bekleniyor", accepted: "Sağlayıcı kabul etti", delivered: "İletildi", read: "Okundu", failed: "Başarısız", cancelled: "İptal" };
/** A bounded Customer operation in the existing workspace body; no modal/editor. */
export function BusinessTemplateMessagePanel({ customerId, disabled, onBusyChange }: { customerId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [configured, setConfigured] = useState(false), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]), [selected, setSelected] = useState("");
  const [parameters, setParameters] = useState<string[][]>([]), [message, setMessage] = useState<BusinessMessage | null>(null), [error, setError] = useState("");
  const [configurationState, setConfigurationState] = useState<"loading" | "ready" | "error">("loading");
  const configurationRequest = useRef(0);
  const invalidateConfigurationRequest = useCallback(() => { ++configurationRequest.current; }, []);
  const refreshConfiguration = useCallback(async () => {
    const request = ++configurationRequest.current;
    setConfigurationState("loading");
    try {
      const bridge = window.yardimciDesktop;
      if (!bridge?.getBusinessMessagingConfiguration) throw new Error("Configuration bridge unavailable");
      const config = await bridge.getBusinessMessagingConfiguration();
      if (request !== configurationRequest.current) return;
      setConfigured(config.configured);
      setConfigurationState("ready");
    } catch {
      if (request === configurationRequest.current) setConfigurationState("error");
    }
  }, []);
  useEffect(() => {
    void refreshConfiguration();
    const off = window.yardimciDesktop?.onBusinessMessagingChanged?.(() => { void refreshConfiguration(); });
    return () => { invalidateConfigurationRequest(); off?.(); };
  }, [refreshConfiguration, invalidateConfigurationRequest]);
  const messageId = message?.id;
  useEffect(() => {
    if (!messageId || !window.yardimciDesktop) return;
    const bridge = window.yardimciDesktop; let live = true;
    const refresh = () => { void bridge.getBusinessMessage(messageId).then((result) => { if (live && result.ok) setMessage(result.value); }).catch(() => {}); };
    const off = bridge.onBusinessMessagingChanged(refresh); refresh(); return () => { live = false; off(); };
  }, [messageId]);
  const template = templates.find((item) => `${item.name}:${item.language}` === selected);
  function choose(value: string) {
    setSelected(value); const item = templates.find((entry) => `${entry.name}:${entry.language}` === value);
    setParameters(item?.components.map((component) => component.parameters.map(() => "")) ?? []); setMessage(null); setError("");
  }
  function working(value: boolean) { setBusy(value); onBusyChange(value); }
  async function load() {
    const bridge = window.yardimciDesktop; if (!bridge) return;
    working(true); setError("");
    try { const result = await bridge.listBusinessMessagingTemplates(); if (!result.ok) { setError(result.message); return; } setTemplates(result.value); setOpen(true); }
    catch { setError("Şablonlar okunamadı."); } finally { working(false); }
  }
  async function send() {
    const bridge = window.yardimciDesktop; if (!bridge || !template) return;
    working(true); setError("");
    try {
      let intent = message;
      if (!intent) { const result = await bridge.prepareBusinessTemplateMessage({ customerId, templateName: template.name, templateLanguage: template.language, parameters });
        if (!result.ok) { setError(result.message); return; } intent = result.value; setMessage(intent); }
      const result = await bridge.sendBusinessTemplateMessage(intent.id, parameters);
      if (!result.ok) { setError(result.message); return; } setMessage(result.value);
    } catch { setError("Mesaj sonucu okunamadı. Aynı mesajı tekrar kontrol edin."); } finally { working(false); }
  }
  if (!configured) return <section className="panel customer-operation-card form-stack" aria-label="WhatsApp Business mesajı" aria-busy={configurationState === "loading"}>
    {configurationState === "loading" ? <p role="status">WhatsApp Business yapılandırması yükleniyor…</p>
      : configurationState === "error" ? <>
        <p role="alert">WhatsApp Business yapılandırması okunamadı.</p>
        <ActionButton variant="secondary" disabled={disabled} onClick={() => void refreshConfiguration()}>Yeniden Dene</ActionButton>
      </> : <div className="empty-state empty-state--compact"><strong>WhatsApp Business yapılandırılmamış.</strong><p>Bağlantıyı Ayarlar → Servisler bölümünden yapılandırın.</p></div>}
  </section>;
  return <section className="panel customer-operation-card form-stack" aria-label="WhatsApp Business mesajı" aria-busy={busy || configurationState === "loading"}>
    <ActionButton variant="secondary" disabled={disabled || busy} busy={busy} onClick={() => void load()}>WhatsApp Business mesajı</ActionButton>
    {open && <>
      <label className="form-field">Onaylı şablon<SearchSelect ariaLabel="Onaylı şablon" value={selected} disabled={busy || Boolean(message)} onChange={choose} clearable={false} options={templates.map(t => ({ id: `${t.name}:${t.language}`, label: t.name, description: `${t.language} · ${t.category}${!t.supported ? " · desteklenmeyen bileşen" : ""}`, disabled: !t.supported }))} /></label>
      {!templates.length && <p>Onaylı şablon bulunamadı.</p>}
      {template?.components.map((component, index) => <div className="form-stack" key={index}>
        {component.parameters.map((name, param) => <label className="form-field" key={name}>{component.type} · {name}<input aria-label={`${component.type} ${name}`} value={parameters[index]?.[param] ?? ""} maxLength={2000} disabled={busy || Boolean(message)}
          onChange={(event) => setParameters((current) => current.map((values, i) => i === index ? values.map((value, j) => j === param ? event.target.value : value) : values))} /></label>)}
        <p aria-label="Şablon önizlemesi">{component.text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, name: string) => parameters[index]?.[component.parameters.indexOf(name)] || match)}</p>
      </div>)}
      <ActionButton disabled={disabled || busy || !template || !template.supported || parameters.some((values) => values.some((value) => !value.trim())) || Boolean(message && message.status !== "draft")} busy={busy} onClick={() => void send()}>Gönder</ActionButton>
      {message && <><p role="status">{statusLabels[message.status]}{message.failureMessage ? ` · ${message.failureMessage}` : ""}</p>
        {message.providerMessageId && <small>Sağlayıcı mesaj kimliği: {message.providerMessageId}</small>}
        <small>Mesaj kaydı: {message.id}</small>
        {message.status === "failed" && <p>Aynı mesaj yeniden gönderilmez. Belirsiz sonuçlar webhook ile güncellenebilir.</p>}
      </>}
      <ActionButton variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Kapat</ActionButton>
    </>}
    {error && <p role="alert">{error}</p>}
    {configurationState === "loading" && <p role="status">WhatsApp Business yapılandırması yükleniyor…</p>}
    {configurationState === "error" && <>
      <p role="alert">WhatsApp Business yapılandırması okunamadı.</p>
      <ActionButton variant="secondary" disabled={disabled || busy} onClick={() => void refreshConfiguration()}>Yeniden Dene</ActionButton>
    </>}
  </section>;
}
