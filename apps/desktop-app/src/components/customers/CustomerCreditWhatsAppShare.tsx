import { useEffect, useRef, useState } from "react";
import type { CustomerCreditAccountDetail } from "@yardimci-asistan/shared";
import { buildCustomerCreditWhatsAppMessage, customerCreditWhatsAppFingerprint, normalizeTRMobilePhone } from "@yardimci-asistan/whatsapp-bridge";
import { customerCreditError, notifyCustomerCreditChanged } from "../../app/customer-credit-ui";
import type { PreparedWhatsAppMessage } from "../../app/whatsapp-handoff";
import { ActionButton } from "../ui/ActionButton";

interface CreditShareDraft { account: CustomerCreditAccountDetail; message: string }

function draftFrom(account: CustomerCreditAccountDetail): CreditShareDraft {
  return { account, message: buildCustomerCreditWhatsAppMessage({ customerName: account.customer.fullName, balances: account.balances }) };
}

/** Mounted only at the intersection of credit and WhatsApp capabilities. */
export function CustomerCreditWhatsAppShare({ account, disabled, readFresh, onPrepared }: {
  account: CustomerCreditAccountDetail;
  disabled: boolean;
  readFresh: () => Promise<CustomerCreditAccountDetail | undefined>;
  onPrepared?: (message: PreparedWhatsAppMessage) => void;
}) {
  const [draft, setDraft] = useState<CreditShareDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const alive = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const hasDraft = draft !== null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (hasDraft) editor.current?.focus(); }, [hasDraft]);

  function close() {
    if (inFlight.current) return;
    setDraft(null); setNotice(""); setError(""); trigger.current?.focus();
  }

  function acceptAccount(next: CustomerCreditAccountDetail): boolean {
    if (next.customer.deletedAt) throw new Error("Silinmiş müşteri hesabı paylaşılamaz.");
    if (!next.balances.some((balance) => balance.amountMinor > 0)) {
      setDraft(null); setNotice("Bu müşterinin açık veresiye borcu kalmamış.");
      return false;
    }
    if (!normalizeTRMobilePhone(next.customer.phone).ok) throw new Error("Bu müşterinin geçerli bir telefon numarası yok.");
    return true;
  }

  async function share() {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(""); setError("");
    try {
      // Never generate from the balance currently displayed on the card.
      const next = await readFresh();
      if (!alive.current || !next) return;
      if (acceptAccount(next)) setDraft(draftFrom(next));
    } catch (cause) {
      if (alive.current) setError(customerCreditError(cause, "Paylaşım hazırlanamadı. Yeniden deneyin."));
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  async function copy(message = draft?.message ?? "") {
    if (!message.trim()) return;
    try {
      await navigator.clipboard.writeText(message);
      if (alive.current) { setError(""); setNotice("Mesaj kopyalandı. Gönderim sizin kontrolünüzde."); }
    } catch {
      if (alive.current) { setError("Panoya kopyalanamadı. Metni seçip elle kopyalayabilirsiniz."); editor.current?.focus(); editor.current?.select(); }
    }
  }

  async function prepare() {
    if (!draft?.message.trim() || disabled || inFlight.current) return;
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge) return;
    inFlight.current = true; setBusy(true); setNotice(""); setError("");
    try {
      const result = await bridge.prepareCustomerCreditWhatsApp({
        customerId: draft.account.customer.id, message: draft.message,
        expectedFingerprint: customerCreditWhatsAppFingerprint({ customerName: draft.account.customer.fullName, phone: draft.account.customer.phone, balances: draft.account.balances })
      });
      if (!alive.current) return;
      if (result.status !== "ready") {
        notifyCustomerCreditChanged(account.customer.id);
        if (!acceptAccount(result.account)) return;
        setDraft(draftFrom(result.account));
        setNotice("Güncel borç veya müşteri bilgileri değişti. Mesaj yenilendi; lütfen tekrar kontrol edin.");
        editor.current?.focus();
        return;
      }
      const action = result.action;
      if (!action.ok) {
        if (action.mode === "official_api_future" && "fallback" in action) {
          setNotice("Bu WhatsApp yöntemi henüz kullanılamıyor. Mesajı kopyalayıp elle paylaşabilirsiniz.");
          return;
        }
        throw new Error(action.message);
      }
      if (action.mode === "manual_copy") { await copy(action.message); return; }
      if (action.mode === "webview") {
        if (!onPrepared) throw new Error("WhatsApp alanı açılamadı. Mesajı kopyalayarak devam edebilirsiniz.");
        onPrepared({ source: "customer_credit", customerId: result.account.customer.id, customerName: result.account.customer.fullName, phone: result.account.customer.phone, message: action.message });
        setNotice("Mesaj WhatsApp'a hazırlandı. Gönderim sizin kontrolünüzde.");
        return;
      }
      if (!await window.yardimciDesktop?.openExternal(action.url)) throw new Error("WhatsApp açılamadı. Mesajı kopyalayıp elle paylaşabilirsiniz.");
      if (alive.current) setNotice("WhatsApp taslağı açıldı. Gönderim sizin kontrolünüzde.");
    } catch (cause) {
      if (alive.current) setError(customerCreditError(cause, "WhatsApp açılamadı. Mesajı kopyalayıp elle paylaşabilirsiniz."));
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  const phone = draft && normalizeTRMobilePhone(draft.account.customer.phone);
  return <section className="customer-credit-share" aria-label="Veresiye WhatsApp paylaşımı">
    <button ref={trigger} type="button" className="action-button action-button-ghost action-button-sm" disabled={disabled || busy || !account.balances.some((balance) => balance.amountMinor > 0)} onClick={() => void share()}>WhatsApp'ta Paylaş</button>
    {draft && <div className="customer-credit-compose" role="region" aria-label="Borç durumunu paylaş" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <h4>Borç durumunu paylaş</h4>
      <p><strong>{draft.account.customer.fullName || "Müşteri"}</strong><br />{phone && phone.ok ? phone.display : draft.account.customer.phone}</p>
      <label className="customer-credit-field">Mesaj
        <textarea ref={editor} aria-label="Veresiye paylaşım mesajı" rows={8} value={draft.message} disabled={busy} onChange={(event) => { setDraft({ ...draft, message: event.target.value }); setError(""); setNotice(""); }} />
      </label>
      <p>Mesaj otomatik gönderilmez. WhatsApp açıldığında son kontrol ve gönderim sizde kalır.</p>
      <div className="customer-credit-actions">
        <ActionButton variant="secondary" disabled={busy || !draft.message.trim()} onClick={() => void copy()}>Kopyala</ActionButton>
        <ActionButton variant="secondary" disabled={disabled || busy || !draft.message.trim()} onClick={() => void prepare()}>{busy ? "Hazırlanıyor…" : "WhatsApp'a Hazırla"}</ActionButton>
        <ActionButton variant="ghost" disabled={busy} onClick={close}>Vazgeç</ActionButton>
      </div>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="customer-credit-error">{error}</p>}
  </section>;
}
