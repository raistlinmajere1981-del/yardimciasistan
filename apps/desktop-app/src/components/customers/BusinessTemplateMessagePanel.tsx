import { SearchSelect } from "../ui/SearchSelect";
import { useEffect, useState } from "react";
import type { BusinessMessage, BusinessMessageTemplate } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
const statusLabels = { draft: "Hazır", queued: "Sağlayıcı sonucu bekleniyor", accepted: "Sağlayıcı kabul etti", delivered: "İletildi", read: "Okundu", failed: "Başarısız", cancelled: "İptal" };
/** A bounded Customer operation in the existing workspace body; no modal/editor. */
export function BusinessTemplateMessagePanel({ customerId, disabled, onBusyChange }: { customerId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [configured, setConfigured] = useState(false), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]), [selected, setSelected] = useState("");
  const [parameters, setParameters] = useState<string[][]>([]), [message, setMessage] = useState<BusinessMessage | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const bridge = window.yardimciDesktop; if (!bridge?.getBusinessMessagingConfiguration) return;
    let live = true;
    const refresh = () => { void bridge.getBusinessMessagingConfiguration().then((config) => { if (live) setConfigured(config.configured); }).catch(() => { if (live) setConfigured(false); }); };
    refresh(); const off = bridge.onBusinessMessagingChanged(refresh); return () => { live = false; off(); };
  }, []);
  useEffect(() => {
    if (!message || !window.yardimciDesktop) return;
    const bridge = window.yardimciDesktop; let live = true;
    const refresh = () => { void bridge.getBusinessMessage(message.id).then((result) => { if (live && result.ok) setMessage(result.value); }).catch(() => {}); };
    const off = bridge.onBusinessMessagingChanged(refresh); refresh(); return () => { live = false; off(); };
  }, [message?.id]);
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
  if (!configured) return null;
  return <section className="panel customer-operation-card form-stack" aria-label="WhatsApp Business mesajı">
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
  </section>;
}
